import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { defineTool, } from '@deepseek-ai/dsh-tools';
import { assignmentOutput, battleResActionOutput, battleResRequestOutput, checkpointRequestOutput, healthOutput, partyMessageOutput, recoveryInstructionOutput, runSummaryOutput, taskLeaseOutput, taskRecordOutput, validationManifestOutput, validationReportOutput, verificationOutput, waitOutput, } from './output-schemas.js';
import { workspaceComputationQueue } from '../adapters/workspace-computation-queue.js';
import { createReadableRunId, DungeonError, } from '../service/dungeon-service.js';
function actor(exec) {
    if (!exec.agent)
        throw new DungeonError('FORBIDDEN', 'Dungeon tools require an authenticated DSH agent');
    return { sessionId: String(exec.agent.id) };
}
function canonical(value) {
    return JSON.parse(JSON.stringify(value));
}
/**
 * Bound free-form text for tool output. Non-string input (numbers, objects,
 * arrays) is dropped instead of being implicitly stringified, so a corrupted
 * or hostile value can never blow up the caller's context budget.
 */
export function boundedText(value, limit = 500) {
    if (typeof value !== 'string')
        return undefined;
    if (value.length <= limit)
        return value;
    return `${value.slice(0, limit)}…`;
}
/** Maximum number of evidence entries accepted from a single tool call. */
const EVIDENCE_MAX_ITEMS = 20;
/** Maximum length of a single evidence entry accepted from a tool call. */
const EVIDENCE_MAX_LENGTH = 500;
/** Maximum evidence entries surfaced per health signal in run summaries. */
const SUMMARY_EVIDENCE_MAX_ITEMS = 3;
/** Maximum length of a single evidence entry in run summaries. */
const SUMMARY_EVIDENCE_MAX_LENGTH = 200;
/**
 * Validate and bound a model-supplied evidence list: element types are still
 * strictly validated by stringList, then the count and per-entry length are
 * capped so oversized arrays or entries cannot flood the audit log and any
 * tool output that echoes them back.
 */
function boundedEvidenceList(value, field) {
    return stringList(value, field)
        .slice(0, EVIDENCE_MAX_ITEMS)
        .map((item) => boundedText(item, EVIDENCE_MAX_LENGTH))
        .filter((item) => item !== undefined);
}
/** Bound evidence entries surfaced in summaries, tolerating non-string entries. */
function boundedSummaryEvidence(items) {
    return items
        .slice(0, SUMMARY_EVIDENCE_MAX_ITEMS)
        .map((item) => boundedText(item, SUMMARY_EVIDENCE_MAX_LENGTH))
        .filter((item) => item !== undefined);
}
function summarizeRun(run) {
    const tasks = Object.entries(run.tasks).slice(0, 100).map(([id, task]) => ({
        id,
        title: task.workOrder.title,
        status: task.status,
        progressState: task.progressState,
        ownerSlot: task.ownerSlot,
        blockedBy: task.workOrder.blockedBy,
        taskVersion: task.workOrder.version,
        leaseVersion: task.activeLease?.version,
        nextCheckpointDueAt: task.nextCheckpointDueAt,
        currentTurnId: task.currentTurnId,
        summary: boundedText(task.executionReports.at(-1)?.summary, 300),
        modifiedAssertions: task.executionReports.at(-1)?.modifiedAssertions?.slice(0, 20).map((item) => ({
            file: boundedText(item.file, 300), test: boundedText(item.test, 300), reason: boundedText(item.reason, 500),
        })),
    }));
    return {
        id: run.id,
        phase: run.phase,
        objective: boundedText(run.objective, 1_000),
        workspaceFingerprint: run.workspaceFingerprint,
        controlState: run.controlState,
        commanderLoad: run.commanderLoad,
        slots: run.slots,
        tasks,
        taskCount: Object.keys(run.tasks).length,
        omittedTaskCount: Math.max(0, Object.keys(run.tasks).length - tasks.length),
        latestMessages: run.messages.slice(-8).map((message) => ({
            messageId: message.messageId,
            fromSlot: message.fromSlot,
            kind: message.kind,
            summary: boundedText(message.summary, 300),
            createdAt: message.createdAt,
        })),
        recentHealthSignals: run.healthSignals.slice(-8).map((signal) => ({
            id: signal.id,
            slot: signal.slot,
            kind: signal.kind,
            severity: signal.severity,
            observedAt: signal.observedAt,
            evidence: boundedSummaryEvidence(signal.evidence),
        })),
        battleResChargesRemaining: run.battleResChargesRemaining,
        commanderBattleResChargesRemaining: run.commanderBattleResChargesRemaining,
        validationReportCount: run.validationReports.length,
        verificationRuns: run.verificationRuns.slice(-8).map((item) => ({
            command: item.command, exitCode: item.exitCode, errorCode: item.errorCode,
            errorMessage: boundedText(item.errorMessage, 200), durationMs: item.durationMs, beganAt: item.beganAt,
            outputExcerpt: boundedText(item.outputExcerpt, 600),
        })),
        resultSummary: boundedText(run.resultSummary, 500),
        updatedAt: run.updatedAt,
    };
}
function summarizeEvents(events) {
    return events.slice(-24).map((event) => {
        const payload = typeof event.payload === 'object' && event.payload !== null
            ? event.payload
            : {};
        return {
            sequence: event.sequence,
            type: event.type,
            occurredAt: event.occurredAt,
            ...['taskId', 'slot', 'phase', 'status', 'reason', 'ticketId', 'resurrectionId']
                .reduce((result, key) => {
                if (typeof payload[key] === 'string' || typeof payload[key] === 'number')
                    result[key] = payload[key];
                return result;
            }, {}),
        };
    });
}
function stringList(value, field) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        throw new DungeonError('INVALID_ARGS', `${field} must be an array of strings`);
    }
    return value;
}
function normalizeWorkOrderDraft(value, runId, generatedId) {
    const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : generatedId;
    const rawTitle = typeof value.title === 'string' ? value.title.trim() : '';
    const rawObjective = typeof value.objective === 'string' ? value.objective.trim() : '';
    const title = rawTitle || rawObjective;
    const objective = rawObjective || rawTitle;
    if (!title)
        throw new DungeonError('INVALID_ARGS', 'workOrder needs a title or objective');
    if (!Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length === 0) {
        throw new DungeonError('INVALID_ARGS', 'workOrder needs at least one acceptance criterion');
    }
    const acceptanceCriteria = value.acceptanceCriteria.map((criterion, index) => {
        const record = typeof criterion === 'object' && criterion !== null && !Array.isArray(criterion)
            ? criterion
            : undefined;
        const description = typeof criterion === 'string'
            ? criterion.trim()
            : typeof record?.description === 'string' ? record.description.trim()
                : typeof record?.criterion === 'string' ? record.criterion.trim()
                    : typeof record?.text === 'string' ? record.text.trim() : '';
        if (!description)
            throw new DungeonError('INVALID_ARGS', `acceptanceCriteria[${index}] needs a description`);
        return {
            id: typeof record?.id === 'string' && record.id.trim() ? record.id.trim() : `${id}:criterion-${index + 1}`,
            description,
            required: typeof record?.required === 'boolean' ? record.required : true,
        };
    });
    const priority = value.priority ?? 'normal';
    if (!['critical', 'high', 'normal', 'low'].includes(String(priority))) {
        throw new DungeonError('INVALID_ARGS', 'workOrder.priority must be critical, high, normal, or low');
    }
    return {
        id,
        runId,
        title,
        objective,
        inputs: stringList(value.inputs, 'workOrder.inputs'),
        constraints: stringList(value.constraints, 'workOrder.constraints'),
        acceptanceCriteria,
        readScopes: stringList(value.readScopes, 'workOrder.readScopes'),
        writeScopes: stringList(value.writeScopes, 'workOrder.writeScopes'),
        globalCommands: stringList(value.globalCommands, 'workOrder.globalCommands'),
        blockedBy: stringList(value.blockedBy, 'workOrder.blockedBy'),
        expectedArtifacts: stringList(value.expectedArtifacts, 'workOrder.expectedArtifacts'),
        priority: priority,
        required: typeof value.required === 'boolean' ? value.required : true,
        version: 1,
    };
}
function normalizeExecutionReport(value, service, runId, sessionId) {
    const taskId = typeof value.taskId === 'string' ? value.taskId.trim() : '';
    if (!taskId)
        throw new DungeonError('INVALID_ARGS', 'report.taskId is required');
    const run = service.getRunForActor({ sessionId }, runId);
    const task = run.tasks[taskId];
    if (!task)
        throw new DungeonError('TASK_NOT_FOUND', `Task ${taskId} does not exist`);
    const slot = ['dps-1', 'dps-2', 'dps-3']
        .find((candidate) => run.slots[candidate].currentSessionId === sessionId);
    if (!slot)
        throw new DungeonError('FORBIDDEN', 'Only a bound DPS can submit execution reports');
    const lease = task.activeLease;
    if (!lease)
        throw new DungeonError('LEASE_REQUIRED', `Task ${taskId} has no active lease`);
    const status = typeof value.status === 'string' ? value.status : 'completed';
    if (!['completed', 'blocked', 'failed'].includes(status)) {
        throw new DungeonError('INVALID_ARGS', 'report.status must be completed, blocked, or failed');
    }
    const summary = typeof value.summary === 'string' && value.summary.trim()
        ? value.summary.trim()
        : typeof value.text === 'string' && value.text.trim() ? value.text.trim() : `${status} ${task.workOrder.title}`;
    const commandsRun = value.commandsRun === undefined ? [] : value.commandsRun;
    const modifiedAssertions = value.modifiedAssertions;
    if (modifiedAssertions !== undefined) {
        if (!Array.isArray(modifiedAssertions))
            throw new DungeonError('INVALID_ARGS', 'report.modifiedAssertions must be an array');
        if (!modifiedAssertions.every((entry) => {
            if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
                return false;
            const item = entry;
            return typeof item.file === 'string' && item.file.trim() && typeof item.reason === 'string' && item.reason.trim() &&
                (item.test === undefined || typeof item.test === 'string');
        }))
            throw new DungeonError('INVALID_ARGS', 'report.modifiedAssertions entries require file and reason');
    }
    if (!Array.isArray(commandsRun) || !commandsRun.every((entry) => (typeof entry === 'object' && entry !== null && typeof entry.command === 'string')))
        throw new DungeonError('INVALID_ARGS', 'report.commandsRun must contain command objects');
    return {
        taskId,
        taskVersion: task.workOrder.version,
        leaseId: lease.leaseId,
        leaseVersion: lease.version,
        slot,
        generation: run.slots[slot].generation,
        status: status,
        summary: boundedText(summary) ?? status,
        changedFiles: stringList(value.changedFiles, 'report.changedFiles'),
        ...(modifiedAssertions === undefined ? {} : { modifiedAssertions: modifiedAssertions.map((entry) => {
                const item = entry;
                return { file: item.file.trim(), ...(item.test === undefined ? {} : { test: item.test.trim() }), reason: item.reason.trim() };
            }) }),
        evidence: boundedEvidenceList(value.evidence, 'report.evidence'),
        commandsRun: commandsRun.map((entry) => {
            const command = entry;
            return {
                command: String(command.command),
                summary: boundedText(typeof command.summary === 'string' ? command.summary : String(command.command)) ?? '',
                ...(typeof command.exitCode === 'number' ? { exitCode: command.exitCode } : {}),
            };
        }),
        risks: stringList(value.risks, 'report.risks'),
        remainingWork: stringList(value.remainingWork, 'report.remainingWork'),
        ...(typeof value.workspaceFingerprint === 'string' ? { workspaceFingerprint: value.workspaceFingerprint } : {}),
    };
}
function normalizePartyMessage(value) {
    const kind = typeof value.kind === 'string' ? value.kind : 'notice';
    if (!['progress', 'blocked', 'risk', 'question', 'decision', 'notice'].includes(kind)) {
        throw new DungeonError('INVALID_ARGS', 'message.kind is invalid');
    }
    const evidence = boundedEvidenceList(value.evidence, 'message.evidence');
    const explicitSummary = typeof value.summary === 'string' ? value.summary.trim()
        : typeof value.text === 'string' ? value.text.trim() : '';
    const summary = boundedText(explicitSummary || evidence[0] || `${kind} update`) ?? `${kind} update`;
    return { kind: kind, summary, evidence };
}
function currentTurnId(exec) {
    const events = exec.agent?.session?.events;
    const turn = events
        ? [...events].reverse().find((event) => event.type === 'turn/start')
        : undefined;
    if (!turn || turn.type !== 'turn/start')
        return undefined;
    return `turn-${turn.data.turn}`;
}
const toolOutputs = {
    party_start: runSummaryOutput,
    party_status: runSummaryOutput,
    party_wait: waitOutput,
    party_phase: runSummaryOutput,
    party_health: healthOutput,
    party_assign: assignmentOutput,
    party_reopen: taskRecordOutput,
    party_retry: taskRecordOutput,
    party_direct_recovery: recoveryInstructionOutput,
    party_request_checkpoint: checkpointRequestOutput,
    party_interrupt: taskRecordOutput,
    party_review_quarantine: taskRecordOutput,
    party_reassign: taskRecordOutput,
    party_recover: runSummaryOutput,
    party_resume_dispatch: runSummaryOutput,
    request_battle_res: battleResRequestOutput,
    work_claim: taskLeaseOutput,
    work_submit: taskRecordOutput,
    verification_run: verificationOutput,
    member_checkpoint: taskRecordOutput,
    party_message: partyMessageOutput,
    member_self_maintain: recoveryInstructionOutput,
    validation_manifest: validationManifestOutput,
    validation_submit: validationReportOutput,
    battle_res: battleResActionOutput,
    party_finish: runSummaryOutput,
    party_cancel: runSummaryOutput,
};
function defineDungeonTool(options) {
    return defineTool({
        ...options,
        output: toolOutputs[options.name],
    });
}
const DEFAULT_VERIFICATION_COMMANDS = ['npm test', 'npm run typecheck', 'npx tsc --noEmit', 'git status --short', 'git diff --stat', 'git diff --numstat'];
const DEFAULT_VERIFICATION_TIMEOUT_MS = 120_000;
function verificationCommands(service) {
    const getter = service.getHealerVerificationCommands;
    return getter ? getter.call(service) : [...DEFAULT_VERIFICATION_COMMANDS];
}
function verificationTimeout(service) {
    const getter = service.getHealerVerificationTimeoutMs;
    return getter ? getter.call(service) : DEFAULT_VERIFICATION_TIMEOUT_MS;
}
function appendBoundedOutput(current, chunk, limit = 16_000) {
    const combined = current + chunk.toString();
    if (combined.length <= limit)
        return combined;
    const headLimit = Math.floor(limit * 0.6);
    return combined.slice(0, headLimit) + combined.slice(-(limit - headLimit));
}
function excerpt(head, tail, limit = 4000) {
    const text = `${head}${head && tail ? '\n' : ''}${tail}`;
    if (text.length <= limit)
        return text;
    const headLimit = Math.floor(limit * 0.6);
    return `${text.slice(0, headLimit)}\n…\n${text.slice(-Math.max(0, limit - headLimit - 3))}`;
}
export async function runVerification(command, timeoutMs, cwd) {
    // Allowlist entries are plain argv strings; split on real whitespace.
    const parts = command.trim().split(/\s+/);
    const started = Date.now();
    return await new Promise((resolveAttempt) => {
        let settled = false;
        const finish = (attempt) => {
            if (!settled) {
                settled = true;
                resolveAttempt(attempt);
            }
        };
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let killTimer;
        const child = spawn(parts[0], parts.slice(1), { cwd, shell: false });
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            // Escalate when SIGTERM is ignored so a hung verification cannot hold
            // the slot forever.
            killTimer = setTimeout(() => {
                child.kill('SIGKILL');
            }, 5_000);
            killTimer.unref?.();
        }, timeoutMs);
        child.stdout?.on('data', (chunk) => {
            stdout = appendBoundedOutput(stdout, chunk);
        });
        child.stderr?.on('data', (chunk) => {
            stderr = appendBoundedOutput(stderr, chunk);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (killTimer)
                clearTimeout(killTimer);
            const outputExcerpt = excerpt(stdout, stderr);
            const durationMs = Date.now() - started;
            if (timedOut) {
                finish({ outcome: 'timeout', outputExcerpt, durationMs });
            }
            else {
                finish({ outcome: 'completed', ...(code === null ? {} : { exitCode: code }), outputExcerpt, durationMs });
            }
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            if (killTimer)
                clearTimeout(killTimer);
            finish({
                outcome: 'spawn-error',
                errorCode: error.code ?? 'SPAWN_ERROR',
                errorMessage: error.message,
                outputExcerpt: excerpt(stdout, stderr),
                durationMs: Date.now() - started,
            });
        });
    });
}
export function registerDungeonTools(ctx, service, agentManager) {
    let validationCounter = 0;
    const disposers = [
        ctx.tools.register(defineDungeonTool({
            name: 'party_start',
            description: 'Create a dungeon-party run and bind the calling agent as tank.',
            parameters: {
                runId: { type: 'string' },
                objective: { type: 'string', required: true },
                workspaceRoot: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                // P0 hardening: the workspace root must exist, be a directory, and
                // stay inside the calling session's authorized cwd so a model cannot
                // point the whole party (and its recursive fingerprint scans) at an
                // arbitrary host directory.
                const suppliedRoot = typeof args.workspaceRoot === 'string' ? args.workspaceRoot.trim() : '';
                if (!suppliedRoot)
                    throw new DungeonError('INVALID_ARGS', 'workspaceRoot is required');
                let canonicalRoot;
                try {
                    canonicalRoot = realpathSync(resolve(suppliedRoot));
                }
                catch {
                    throw new DungeonError('WORKSPACE_ROOT_NOT_FOUND', `workspaceRoot does not exist or is not accessible: ${suppliedRoot}`);
                }
                try {
                    if (!statSync(canonicalRoot).isDirectory()) {
                        throw new DungeonError('WORKSPACE_ROOT_NOT_DIRECTORY', `workspaceRoot is not a directory: ${suppliedRoot}`);
                    }
                }
                catch (error) {
                    if (error instanceof DungeonError)
                        throw error;
                    throw new DungeonError('WORKSPACE_ROOT_NOT_FOUND', `workspaceRoot cannot be read: ${suppliedRoot}`);
                }
                const sessionCwd = exec.agent?.session?.header?.cwd;
                if (typeof sessionCwd === 'string' && sessionCwd.trim()) {
                    let cwdReal;
                    try {
                        cwdReal = realpathSync(sessionCwd);
                    }
                    catch {
                        cwdReal = undefined;
                    }
                    if (cwdReal) {
                        const relation = relative(cwdReal, canonicalRoot);
                        if (relation === '..' || relation.startsWith('../') || isAbsolute(relation)) {
                            throw new DungeonError('WORKSPACE_ROOT_FORBIDDEN', `workspaceRoot must stay inside the session workspace (${cwdReal}); refusing ${canonicalRoot}`);
                        }
                    }
                }
                const workspaceFingerprint = await workspaceComputationQueue.fingerprint(canonicalRoot, service.getFingerprintIgnoreScopes());
                return canonical(summarizeRun(service.startRun({
                    ...(args.runId ? { runId: args.runId } : {}),
                    objective: args.objective,
                    workspaceRoot: canonicalRoot,
                    workspaceFingerprint,
                    tankSessionId: caller.sessionId,
                })));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_status',
            description: 'Read the current dungeon-party run state as a current party member.',
            parameters: {
                runId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                service.assertRunAccess(caller, args.runId);
                return canonical(summarizeRun(service.sweepExpiredState(args.runId)));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_wait',
            description: 'Wait for durable run events newer than an event sequence cursor.',
            parameters: {
                runId: { type: 'string', required: true },
                afterSequence: { type: 'number', required: true },
                timeoutMs: { type: 'number' },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                service.assertRunAccess(caller, args.runId);
                service.sweepExpiredState(args.runId);
                const result = await service.waitForChange(caller, args.runId, args.afterSequence, args.timeoutMs ?? 30_000, exec.signal);
                return canonical({
                    run: summarizeRun(result.run),
                    events: summarizeEvents(result.events),
                    omittedEventCount: Math.max(0, result.events.length - 24),
                    timedOut: result.timedOut,
                });
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_phase',
            description: 'As tank, move the run through FORMING→PLANNING (create all work orders)→EXECUTING (then assign DPS)→VALIDATING; entering execution activates the healer first.',
            parameters: {
                runId: { type: 'string', required: true },
                phase: {
                    type: 'string',
                    enum: ['FORMING', 'PLANNING', 'PLAN_REVIEW', 'EXECUTING', 'VALIDATING', 'REPAIR', 'FAILED', 'CANCELLED'],
                    required: true,
                },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const phase = args.phase;
                if (phase === 'VALIDATING') {
                    const run = service.changePhase(caller, args.runId, phase);
                    await agentManager?.prepareForPhase(caller, args.runId, phase);
                    return canonical(summarizeRun(run));
                }
                await agentManager?.prepareForPhase(caller, args.runId, phase);
                service.changePhase(caller, args.runId, phase);
                if (phase === 'EXECUTING' || phase === 'REPAIR') {
                    await agentManager?.dispatchAvailableTasks?.(caller, args.runId);
                }
                return canonical(summarizeRun(service.getRunForActor(caller, args.runId)));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_health',
            description: 'Read auditable readiness, progress, commander load, checkpoint, and recovery state.',
            parameters: {
                runId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                service.assertRunAccess(caller, args.runId);
                const run = service.sweepExpiredState(args.runId);
                return canonical({
                    controlState: run.controlState,
                    commanderLoad: run.commanderLoad,
                    commanderCheckpoint: run.commanderCheckpoint,
                    slots: run.slots,
                    healthSignals: run.healthSignals.slice(-16).map((signal) => ({
                        id: signal.id, slot: signal.slot, kind: signal.kind, severity: signal.severity, observedAt: signal.observedAt,
                    })),
                    taskProgress: Object.entries(run.tasks).slice(0, 100).map(([taskId, task]) => ({
                        taskId,
                        progressState: task.progressState,
                        missedCheckpoints: task.missedCheckpoints,
                        nextCheckpointDueAt: task.nextCheckpointDueAt,
                        currentTurnId: task.currentTurnId,
                    })),
                    battleResChargesRemaining: run.battleResChargesRemaining,
                    commanderBattleResChargesRemaining: run.commanderBattleResChargesRemaining,
                });
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_assign',
            description: 'As tank, create a work order draft (runId/version/list defaults are host-normalized) or assign after party_phase enters EXECUTING/REPAIRING.',
            parameters: {
                runId: { type: 'string', required: true },
                action: { type: 'string', enum: ['create', 'assign'], required: true },
                workOrder: {
                    type: 'object',
                    additionalProperties: false,
                    description: 'Work-order draft. The host generates id, runId, version, criterion ids, and omitted list defaults.',
                    properties: {
                        id: { type: 'string', description: 'Optional caller label; omit to use a host-generated task id.' },
                        runId: { type: 'string', description: 'Deprecated and ignored; outer runId is authoritative.' },
                        title: { type: 'string' },
                        objective: { type: 'string' },
                        inputs: { type: 'array', items: { type: 'string' } },
                        constraints: { type: 'array', items: { type: 'string' } },
                        acceptanceCriteria: {
                            type: 'array',
                            required: true,
                            items: {
                                oneOf: [
                                    { type: 'string' },
                                    {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: {
                                            id: { type: 'string' },
                                            description: { type: 'string', required: true },
                                            required: { type: 'boolean' },
                                        },
                                    },
                                ],
                            },
                        },
                        readScopes: { type: 'array', items: { type: 'string' } },
                        writeScopes: { type: 'array', items: { type: 'string' } },
                        globalCommands: { type: 'array', items: { type: 'string' } },
                        blockedBy: { type: 'array', items: { type: 'string' } },
                        expectedArtifacts: { type: 'array', items: { type: 'string' } },
                        priority: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
                        required: { type: 'boolean' },
                        version: { type: 'integer', description: 'Ignored for creation; host always starts at version 1.' },
                    },
                },
                taskId: { type: 'string' },
                slot: { type: 'string', enum: ['dps-1', 'dps-2', 'dps-3'] },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                if (args.action === 'create') {
                    if (!args.workOrder || typeof args.workOrder !== 'object' || Array.isArray(args.workOrder)) {
                        throw new DungeonError('INVALID_ARGS', 'workOrder is required for create');
                    }
                    const run = service.getRunForActor(caller, args.runId);
                    let ordinal = run.taskSetVersion + 1;
                    while (run.tasks[`task-${ordinal}`])
                        ordinal += 1;
                    return canonical(service.createTask(caller, args.runId, normalizeWorkOrderDraft(args.workOrder, args.runId, `task-${ordinal}`)));
                }
                if (!args.taskId || !args.slot)
                    throw new DungeonError('INVALID_ARGS', 'taskId and slot are required for assign');
                const run = service.getRunForActor(caller, args.runId);
                if (run.phase !== 'EXECUTING' && run.phase !== 'REPAIR') {
                    return canonical({
                        ok: false,
                        code: 'INVALID_PHASE',
                        message: `Assignment is not available during ${run.phase}. Finish creating work orders, then enter EXECUTING.`,
                        currentPhase: run.phase,
                        recommendedAction: { tool: 'party_phase', runId: args.runId, phase: 'EXECUTING' },
                    });
                }
                service.preflightTaskAssignment(caller, args.runId, args.taskId, args.slot);
                await agentManager?.ensureMember(caller, args.runId, args.slot);
                const assigned = service.assignTask(caller, args.runId, args.taskId, args.slot);
                agentManager?.dispatchTask(caller, args.runId, args.taskId);
                return canonical(assigned);
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_reopen',
            description: 'As tank, reopen a failed finding owner task for a versioned repair cycle.',
            parameters: {
                runId: { type: 'string', required: true },
                taskId: { type: 'string', required: true },
                findingIds: { type: 'array', items: { type: 'string' }, required: true },
            },
            async execute(args, exec) {
                return canonical(service.reopenTask(actor(exec), args.runId, args.taskId, args.findingIds));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_retry',
            description: 'As tank, send a blocked or failed task back to the schedulable pool with an auditable reason; bounded by the execution retry limit. Use it when execution itself failed (no validation report exists yet); use party_reopen for validation findings.',
            parameters: {
                runId: { type: 'string', required: true },
                taskId: { type: 'string', required: true },
                reason: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const task = service.retryExecution(caller, args.runId, args.taskId, args.reason);
                await agentManager?.kickScheduler(args.runId);
                return canonical(task);
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_direct_recovery',
            description: 'As tank, issue validator-maintenance to a degraded but responsive healer.',
            parameters: {
                runId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                if (agentManager) {
                    return canonical(await agentManager.executeValidatorMaintenance(caller, args.runId));
                }
                return canonical(service.directValidatorMaintenance(caller, args.runId));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_request_checkpoint',
            description: 'As tank, request an immediate lease-bound checkpoint from a running DPS task.',
            parameters: {
                runId: { type: 'string', required: true },
                taskId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                if (agentManager) {
                    return canonical(agentManager.requestCheckpoint(caller, args.runId, args.taskId));
                }
                return canonical(service.requestTaskCheckpoint(caller, args.runId, args.taskId));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_interrupt',
            description: 'As tank, request interruption of the exact active Turn for a confirmed stalled task.',
            parameters: {
                runId: { type: 'string', required: true },
                taskId: { type: 'string', required: true },
                turnId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                if (!agentManager) {
                    return canonical(service.requestTaskInterrupt(caller, args.runId, args.taskId, args.turnId));
                }
                return canonical(await agentManager.interruptTask(caller, args.runId, args.taskId, args.turnId));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_review_quarantine',
            description: 'As tank, confirm review of workspace files quarantined after a Turn interruption.',
            parameters: {
                runId: { type: 'string', required: true },
                taskId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                return canonical(service.reviewQuarantinedChanges(actor(exec), args.runId, args.taskId));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_reassign',
            description: 'As tank, reassign a safely interrupted task after lease revocation and quarantine review.',
            parameters: {
                runId: { type: 'string', required: true },
                taskId: { type: 'string', required: true },
                slot: { type: 'string', enum: ['dps-1', 'dps-2', 'dps-3'], required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const slot = args.slot;
                await agentManager?.ensureMember(caller, args.runId, slot);
                const task = service.reassignTask(caller, args.runId, args.taskId, slot);
                agentManager?.dispatchTask(caller, args.runId, args.taskId);
                return canonical(task);
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_recover',
            description: 'As the original Commander after a network stop, continue the existing dungeon or restart it as a fresh run. The host generates the new run id when restarting.',
            parameters: {
                runId: { type: 'string', required: true },
                action: { type: 'string', enum: ['continue', 'restart'], required: true },
                newRunId: { type: 'string', description: 'Optional explicit id for restart; normally omit it.' },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                if (args.action === 'continue') {
                    const run = service.recoverRunAfterCommanderReturn(caller, args.runId);
                    await agentManager?.restoreBoundParty(caller, args.runId);
                    await agentManager?.kickScheduler(args.runId);
                    return canonical(summarizeRun(run));
                }
                const previous = service.getRunForActor(caller, args.runId);
                if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(previous.phase)) {
                    service.changePhase(caller, args.runId, 'CANCELLED');
                }
                await agentManager?.disposeRun(args.runId);
                const newRunId = args.newRunId?.trim() || createReadableRunId();
                const workspaceFingerprint = await workspaceComputationQueue.fingerprint(previous.workspaceRoot, service.getFingerprintIgnoreScopes());
                return canonical(summarizeRun(service.startRun({
                    runId: newRunId,
                    objective: previous.objective,
                    workspaceRoot: previous.workspaceRoot,
                    workspaceFingerprint,
                    tankSessionId: caller.sessionId,
                })));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_resume_dispatch',
            description: 'As the recovered tank, resume dispatch after reviewing the commander checkpoint.',
            parameters: {
                runId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                return canonical(summarizeRun(service.resumeDispatch(actor(exec), args.runId)));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'request_battle_res',
            description: 'As tank, reserve battle resurrection only when party_health reports the DPS lifeState=down; use checkpoint/interrupt for an alive stalled DPS.',
            parameters: {
                runId: { type: 'string', required: true },
                slot: { type: 'string', enum: ['dps-1', 'dps-2', 'dps-3'], required: true },
                resurrectionId: { type: 'string' },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const run = service.getRunForActor(caller, args.runId);
                const currentLifeState = run.slots[args.slot].lifeState;
                if (currentLifeState !== 'down') {
                    return canonical({
                        ok: false,
                        code: 'MEMBER_NOT_DOWN',
                        message: `Battle resurrection requires lifeState=down; ${args.slot} is currently ${currentLifeState}.`,
                        currentLifeState,
                        recommendedTools: ['party_request_checkpoint', 'party_interrupt'],
                    });
                }
                const request = service.requestBattleRes(caller, args.runId, args.slot, args.resurrectionId);
                agentManager?.dispatchBattleRes(caller, args.runId, request.resurrectionId);
                return canonical(request);
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'work_claim',
            description: 'Claim a task assigned to the calling DPS and receive its versioned lease.',
            parameters: {
                runId: { type: 'string', required: true },
                taskId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const lease = agentManager
                    ? await agentManager.claimTaskWithAudit(caller, args.runId, args.taskId)
                    : service.claimTask(caller, args.runId, args.taskId);
                const turnId = currentTurnId(exec);
                if (turnId)
                    service.registerTaskTurn(args.runId, args.taskId, turnId);
                return canonical(lease);
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'work_submit',
            description: 'Submit business results for the calling DPS current lease; host derives technical lease and generation fields.',
            parameters: {
                runId: { type: 'string', required: true },
                report: {
                    type: 'object', additionalProperties: false, required: true,
                    description: 'Business report only; host derives slot, generation, task version, and lease identity.',
                    properties: {
                        taskId: { type: 'string', required: true },
                        status: { type: 'string', enum: ['completed', 'blocked', 'failed'] },
                        summary: { type: 'string' },
                        text: { type: 'string', description: 'Convenience alias for summary.' },
                        changedFiles: { type: 'array', items: { type: 'string' } },
                        evidence: { type: 'array', items: { type: 'string' } },
                        commandsRun: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
                                    command: { type: 'string', required: true }, exitCode: { type: 'number' }, summary: { type: 'string' },
                                } } },
                        risks: { type: 'array', items: { type: 'string' } },
                        remainingWork: { type: 'array', items: { type: 'string' } },
                        workspaceFingerprint: { type: 'string' },
                    },
                },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const report = normalizeExecutionReport(args.report, service, args.runId, caller.sessionId);
                const turnId = currentTurnId(exec);
                if (turnId)
                    service.registerTaskTurn(args.runId, report.taskId, turnId);
                const task = agentManager
                    ? await agentManager.submitExecutionWithAudit(caller, args.runId, report)
                    : service.submitExecution(caller, args.runId, report);
                await agentManager?.kickScheduler(args.runId);
                return canonical(task);
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'verification_run',
            description: 'Healer-only: execute one allowlisted workspace verification command and persist its bounded result.',
            parameters: {
                runId: { type: 'string', required: true },
                command: { type: 'string', required: true },
                timeoutMs: { type: 'number' },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const run = service.getRunForActor(caller, args.runId);
                if (run.slots.healer.currentSessionId !== caller.sessionId)
                    throw new DungeonError('FORBIDDEN', 'verification_run is healer-only');
                const commands = verificationCommands(service);
                if (typeof args.command !== 'string' || !commands.includes(args.command))
                    throw new DungeonError('INVALID_COMMAND', 'Command is not allowlisted');
                const limit = verificationTimeout(service);
                const requested = args.timeoutMs ?? limit;
                if (!Number.isInteger(requested) || requested < 1 || requested > limit)
                    throw new DungeonError('INVALID_ARGS', `timeoutMs must be a positive integer <= ${limit}`);
                const attempt = await runVerification(args.command, requested, run.workspaceRoot);
                if (attempt.outcome === 'timeout')
                    return canonical({ code: 'VERIFICATION_TIMEOUT', command: args.command, durationMs: attempt.durationMs, outputExcerpt: attempt.outputExcerpt });
                // Completed and spawn-failed attempts are both persisted structurally:
                // a spawn failure carries its errorCode instead of masquerading as a
                // normal record without an exit code.
                const recorded = service.recordVerificationCommand(caller, args.runId, {
                    command: args.command,
                    ...(attempt.exitCode === undefined ? {} : { exitCode: attempt.exitCode }),
                    ...(attempt.errorCode === undefined ? {} : { errorCode: attempt.errorCode }),
                    ...(attempt.errorMessage === undefined ? {} : { errorMessage: attempt.errorMessage }),
                    durationMs: attempt.durationMs,
                    outputExcerpt: attempt.outputExcerpt,
                    beganAt: new Date(Date.now() - attempt.durationMs).toISOString(),
                });
                return canonical(recorded);
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'member_checkpoint',
            description: 'As the owning DPS, submit a lease-bound progress checkpoint with evidence delta. Technical fields (lease identity, slot, versions, fingerprint) are host-derived from your active lease; you only provide taskId and the semantic lists.',
            parameters: {
                runId: { type: 'string', required: true },
                taskId: { type: 'string', required: true },
                completed: { type: 'array', items: { type: 'string' }, description: 'Completed steps since the last checkpoint.' },
                nextSteps: { type: 'array', items: { type: 'string' } },
                evidenceDelta: { type: 'array', items: { type: 'string' }, description: 'New evidence observed since the last checkpoint.' },
                blockers: { type: 'array', items: { type: 'string' } },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const run = service.getRunForActor(caller, args.runId);
                const task = run.tasks[args.taskId];
                if (!task)
                    throw new DungeonError('TASK_NOT_FOUND', `Task ${args.taskId} does not exist`);
                const lease = task.activeLease;
                if (!lease)
                    throw new DungeonError('LEASE_REQUIRED', `Task ${args.taskId} has no active lease; call work_claim first`);
                const slot = ['dps-1', 'dps-2', 'dps-3']
                    .find((candidate) => run.slots[candidate].currentSessionId === caller.sessionId);
                if (!slot)
                    throw new DungeonError('FORBIDDEN', 'Only a bound DPS can submit checkpoints');
                const checkpoint = {
                    checkpointId: `cp-${lease.leaseId}-v${lease.version}`,
                    taskId: args.taskId,
                    taskVersion: task.workOrder.version,
                    leaseId: lease.leaseId,
                    leaseVersion: lease.version,
                    slot,
                    completed: stringList(args.completed, 'completed'),
                    nextSteps: stringList(args.nextSteps, 'nextSteps'),
                    evidenceDelta: boundedEvidenceList(args.evidenceDelta, 'evidenceDelta'),
                    blockers: stringList(args.blockers, 'blockers'),
                    workspaceFingerprint: run.workspaceFingerprint,
                };
                const turnId = currentTurnId(exec);
                if (turnId)
                    service.registerTaskTurn(args.runId, args.taskId, turnId);
                const submitted = service.submitCheckpoint(caller, args.runId, checkpoint);
                await agentManager?.refreshLeaseAudit(args.runId, args.taskId);
                return canonical(submitted);
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_message',
            description: 'Send an auditable structured message to a currently bound party slot.',
            parameters: {
                runId: { type: 'string', required: true },
                toSlot: { type: 'string', enum: ['tank', 'dps-1', 'dps-2', 'dps-3', 'healer'], required: true },
                message: {
                    type: 'object',
                    additionalProperties: false,
                    required: true,
                    properties: {
                        kind: { type: 'string', enum: ['progress', 'blocked', 'risk', 'question', 'decision', 'notice'] },
                        summary: { type: 'string', description: 'Concise auditable summary; falls back to text or first evidence entry.' },
                        text: { type: 'string', description: 'Convenience alias for summary.' },
                        evidence: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const message = normalizePartyMessage(args.message);
                if (agentManager) {
                    return canonical(agentManager.sendPartyMessage(caller, args.runId, args.toSlot, message));
                }
                return canonical(service.sendPartyMessage(caller, args.runId, args.toSlot, message));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'member_self_maintain',
            description: 'As healer, complete a tank-directed validator-maintenance instruction in the same Session.',
            parameters: {
                runId: { type: 'string', required: true },
                instructionId: { type: 'string', required: true },
                success: { type: 'boolean', required: true },
            },
            async execute(args, exec) {
                return canonical(service.completeValidatorMaintenance(actor(exec), args.runId, args.instructionId, args.success));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'validation_manifest',
            description: 'As tank create, or as healer retrieve, the immutable manifest for the current workspace.',
            parameters: {
                runId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const run = service.getRunForActor(caller, args.runId);
                const fingerprint = await workspaceComputationQueue.fingerprint(run.workspaceRoot, service.getFingerprintIgnoreScopes());
                return canonical(service.createValidationManifest(caller, args.runId, fingerprint));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'validation_submit',
            description: 'As the bound healer, submit a structured report for the current validation manifest. Manifest version, task-set version, and workspace fingerprint are host-derived from the current manifest; provide only the verdict, per-criterion checks, findings, and summary.',
            parameters: {
                runId: { type: 'string', required: true },
                verdict: { type: 'string', enum: ['pass', 'fail', 'blocked'], required: true },
                summary: { type: 'string', required: true },
                checks: {
                    type: 'array', required: true,
                    items: {
                        type: 'object', additionalProperties: false,
                        properties: {
                            criterionId: { type: 'string', required: true },
                            status: { type: 'string', enum: ['pass', 'fail', 'blocked', 'not-applicable'], required: true },
                            evidence: { type: 'array', items: { type: 'string' } },
                            notApplicableReason: { type: 'string' },
                        },
                    },
                },
                findings: {
                    type: 'array', required: true,
                    items: {
                        type: 'object', additionalProperties: false,
                        properties: {
                            id: { type: 'string', required: true },
                            severity: { type: 'string', enum: ['critical', 'major', 'minor'], required: true },
                            ownerTaskId: { type: 'string' },
                            title: { type: 'string', required: true },
                            evidence: { type: 'string', required: true },
                            remediation: { type: 'string', required: true },
                        },
                    },
                },
                validationId: { type: 'string', description: 'Optional idempotency label; host generates one when omitted.' },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const run = service.getRunForActor(caller, args.runId);
                const manifest = run.manifests.at(-1);
                if (!manifest)
                    throw new DungeonError('MANIFEST_REQUIRED', 'No validation manifest exists; the tank must create one during VALIDATING');
                const submission = {
                    validationId: typeof args.validationId === 'string' && args.validationId.trim()
                        ? args.validationId.trim()
                        : `validation-${manifest.manifestVersion}-${++validationCounter}`,
                    verdict: args.verdict,
                    taskSetVersion: manifest.taskSetVersion,
                    manifestVersion: manifest.manifestVersion,
                    workspaceFingerprint: manifest.workspaceFingerprint,
                    checks: args.checks.map((check) => ({
                        criterionId: String(check.criterionId),
                        status: check.status,
                        evidence: boundedEvidenceList(check.evidence, 'checks[].evidence'),
                        ...(typeof check.notApplicableReason === 'string' ? { notApplicableReason: check.notApplicableReason } : {}),
                    })),
                    findings: args.findings.map((finding) => ({
                        id: String(finding.id),
                        severity: finding.severity,
                        ...(typeof finding.ownerTaskId === 'string' ? { ownerTaskId: finding.ownerTaskId } : {}),
                        title: boundedText(String(finding.title)) ?? '',
                        evidence: boundedText(String(finding.evidence)) ?? '',
                        remediation: boundedText(String(finding.remediation)) ?? '',
                    })),
                    summary: args.summary,
                };
                return canonical(service.submitValidation(caller, args.runId, submission));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'battle_res',
            description: 'As healer, consume or settle an authorized DPS resurrection or emergency commander ticket.',
            parameters: {
                runId: { type: 'string', required: true },
                action: {
                    type: 'string',
                    enum: ['start-dps', 'complete-dps', 'consume-commander', 'complete-commander'],
                    required: true,
                },
                resurrectionId: { type: 'string' },
                ticketId: { type: 'string' },
                mode: { type: 'string', enum: ['resume', 'replace'] },
                outcome: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        success: { type: 'boolean', required: true },
                        sessionId: { type: 'string', required: true },
                        mode: { type: 'string', enum: ['resume', 'replace'] },
                    },
                },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                if (args.action === 'start-dps') {
                    if (!args.resurrectionId)
                        throw new DungeonError('INVALID_ARGS', 'resurrectionId is required');
                    return canonical(service.startBattleRes(caller, args.runId, args.resurrectionId));
                }
                if (args.action === 'complete-dps') {
                    if (!args.resurrectionId)
                        throw new DungeonError('INVALID_ARGS', 'resurrectionId is required');
                    const outcome = args.outcome;
                    const mode = args.mode ?? outcome?.mode;
                    if (agentManager) {
                        if (!mode)
                            throw new DungeonError('INVALID_ARGS', 'mode is required');
                        return canonical(await agentManager.completeDpsResurrection(caller, args.runId, args.resurrectionId, mode));
                    }
                    if (!outcome || !mode)
                        throw new DungeonError('INVALID_ARGS', 'outcome and mode are required without an Agent manager');
                    return canonical(service.completeBattleRes(caller, args.runId, args.resurrectionId, { ...outcome, mode }));
                }
                if (args.action === 'consume-commander') {
                    if (!args.ticketId)
                        throw new DungeonError('INVALID_ARGS', 'ticketId is required');
                    return canonical(service.consumeCommanderRescueTicket(caller, args.runId, args.ticketId));
                }
                if (!args.ticketId)
                    throw new DungeonError('INVALID_ARGS', 'ticketId is required');
                if (agentManager) {
                    return canonical(await agentManager.recoverCommander(caller, args.runId, args.ticketId));
                }
                if (!args.outcome)
                    throw new DungeonError('INVALID_ARGS', 'outcome is required without an Agent manager');
                return canonical(service.completeCommanderResurrection(caller, args.runId, args.ticketId, args.outcome));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_finish',
            description: 'As tank, complete a run only when every service-layer validation gate passes.',
            parameters: {
                runId: { type: 'string', required: true },
                resultSummary: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const caller = actor(exec);
                const current = service.getRunForActor(caller, args.runId);
                const fingerprint = await workspaceComputationQueue.fingerprint(current.workspaceRoot, service.getFingerprintIgnoreScopes());
                // Two-phase completion (PRD §14.1): the service re-derives the
                // workspace fingerprint between run-completion-prepared and
                // run-completed, so an external change during that window aborts the
                // completion instead of certifying a stale workspace.
                const run = await service.finishRun(caller, args.runId, args.resultSummary, fingerprint, () => workspaceComputationQueue.fingerprint(current.workspaceRoot, service.getFingerprintIgnoreScopes()));
                await agentManager?.disposeRun(args.runId);
                return canonical(summarizeRun(run));
            },
        })),
        ctx.tools.register(defineDungeonTool({
            name: 'party_cancel',
            description: 'As tank, cancel a non-terminal run and stop all owned party child Agents.',
            parameters: {
                runId: { type: 'string', required: true },
            },
            async execute(args, exec) {
                const run = service.changePhase(actor(exec), args.runId, 'CANCELLED');
                await agentManager?.disposeRun(args.runId);
                return canonical(summarizeRun(run));
            },
        })),
    ];
    return () => {
        for (const dispose of disposers.reverse())
            dispose();
    };
}
