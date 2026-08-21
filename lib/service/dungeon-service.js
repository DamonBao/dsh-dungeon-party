import { matchesGlob } from 'node:path';
export class DungeonError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'DungeonError';
    }
}
export const defaultDungeonConfig = {
    scopeEnforcementMode: 'auto',
    effectiveScopeEnforcementMode: 'aggregate',
    strictPerAgentWriteScopes: false,
    sessionWriteTelemetryAvailable: false,
    maxConcurrentDps: 3,
    maxRepairRounds: 3,
    battleResCharges: 1,
    commanderBattleResCharges: 1,
    resurrectionTimeoutMs: 120_000,
    commanderRescueTicketTtlMs: 60_000,
    commanderResurrectionTimeoutMs: 120_000,
    maxGenerationsPerSlot: 3,
    chargeOnFailedResurrection: true,
    progressCheckpointIntervalMs: 180_000,
    checkpointResponseTimeoutMs: 60_000,
    maxMissedCheckpoints: 2,
    taskLeaseDurationMs: 600_000,
    readinessEvaluationWindowMs: 120_000,
    readinessWarningSignalCount: 2,
    readinessCriticalSignalCount: 2,
    commanderMaxPendingDecisions: 6,
    commanderDecisionSlaMs: 180_000,
    fingerprintIgnoreScopes: [
        '.git/**', 'node_modules/**', 'lib/**', 'dist/**', 'coverage/**', '.dsh/dungeon-party/tmp/**',
    ],
    validationRequired: true,
};
export function resolveDungeonConfig(input) {
    const config = {
        ...defaultDungeonConfig,
        ...input,
        fingerprintIgnoreScopes: [...(input.fingerprintIgnoreScopes ?? defaultDungeonConfig.fingerprintIgnoreScopes)],
    };
    assert(['auto', 'telemetry', 'aggregate', 'serial'].includes(config.scopeEnforcementMode), 'INVALID_CONFIG', 'scopeEnforcementMode is invalid');
    if (config.scopeEnforcementMode === 'telemetry') {
        assert(config.sessionWriteTelemetryAvailable, 'INVALID_CONFIG', 'telemetry mode requires Session write telemetry');
        config.effectiveScopeEnforcementMode = 'telemetry';
    }
    else if (config.scopeEnforcementMode === 'auto') {
        config.effectiveScopeEnforcementMode = config.sessionWriteTelemetryAvailable
            ? 'telemetry'
            : config.strictPerAgentWriteScopes
                ? 'serial'
                : 'aggregate';
    }
    else {
        config.effectiveScopeEnforcementMode = config.scopeEnforcementMode;
    }
    const positiveIntegers = [
        'maxConcurrentDps',
        'maxRepairRounds',
        'progressCheckpointIntervalMs',
        'checkpointResponseTimeoutMs',
        'maxMissedCheckpoints',
        'taskLeaseDurationMs',
        'resurrectionTimeoutMs',
        'commanderRescueTicketTtlMs',
        'commanderResurrectionTimeoutMs',
        'maxGenerationsPerSlot',
        'readinessEvaluationWindowMs',
        'readinessWarningSignalCount',
        'readinessCriticalSignalCount',
        'commanderMaxPendingDecisions',
        'commanderDecisionSlaMs',
    ];
    for (const key of positiveIntegers) {
        const value = config[key];
        assert(typeof value === 'number' && Number.isInteger(value) && value >= 1, 'INVALID_CONFIG', `${key} must be a positive integer`);
    }
    assert(config.maxConcurrentDps <= 3, 'INVALID_CONFIG', 'maxConcurrentDps cannot exceed 3');
    assert(config.battleResCharges >= 0 && Number.isInteger(config.battleResCharges), 'INVALID_CONFIG', 'battleResCharges must be a non-negative integer');
    assert(config.commanderBattleResCharges >= 1 && Number.isInteger(config.commanderBattleResCharges), 'INVALID_CONFIG', 'commanderBattleResCharges must be a positive integer');
    const minimumLease = config.maxMissedCheckpoints *
        (config.progressCheckpointIntervalMs + config.checkpointResponseTimeoutMs);
    assert(config.taskLeaseDurationMs > minimumLease, 'INVALID_CONFIG', 'taskLeaseDurationMs must exceed all checkpoint observation windows');
    for (const scope of config.fingerprintIgnoreScopes) {
        assert(isSafeScope(scope), 'INVALID_CONFIG', `Unsafe fingerprint ignore scope: ${scope}`);
    }
    return config;
}
const slots = ['tank', 'dps-1', 'dps-2', 'dps-3', 'healer'];
const dpsSlots = ['dps-1', 'dps-2', 'dps-3'];
const terminalPhases = ['COMPLETED', 'FAILED', 'CANCELLED'];
const phaseTransitions = {
    FORMING: ['PLANNING', 'FAILED', 'CANCELLED'],
    PLANNING: ['PLAN_REVIEW', 'EXECUTING', 'FAILED', 'CANCELLED'],
    PLAN_REVIEW: ['PLANNING', 'EXECUTING', 'FAILED', 'CANCELLED'],
    EXECUTING: ['VALIDATING', 'REPAIR', 'FAILED', 'CANCELLED'],
    VALIDATING: ['COMPLETED', 'REPAIR', 'FAILED', 'CANCELLED'],
    REPAIR: ['EXECUTING', 'VALIDATING', 'FAILED', 'CANCELLED'],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
};
function clone(value) {
    return structuredClone(value);
}
function jsonClone(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        throw new DungeonError('NON_JSON_DATA', 'Dungeon state contains non-JSON-serializable data');
    }
}
function createEmptySlots(runId) {
    return {
        tank: { runId, slot: 'tank', generation: 0, history: [] },
        'dps-1': { runId, slot: 'dps-1', generation: 0, history: [] },
        'dps-2': { runId, slot: 'dps-2', generation: 0, history: [] },
        'dps-3': { runId, slot: 'dps-3', generation: 0, history: [] },
        healer: { runId, slot: 'healer', generation: 0, history: [] },
    };
}
function assert(condition, code, message) {
    if (!condition)
        throw new DungeonError(code, message);
}
function isSafeScope(scope) {
    return (scope.length > 0 &&
        !scope.startsWith('/') &&
        !scope.startsWith('\\') &&
        !/^[A-Za-z]:/.test(scope) &&
        !scope.split('/').includes('..') &&
        !scope.includes('\\'));
}
function normalizeCommand(command) {
    return command.trim().replace(/\s+/g, ' ');
}
function isWorkspaceGlobalCommand(command) {
    return /^(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall|update|upgrade)\b/i.test(command) ||
        /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:format|fmt|codegen|generate|migrate)\b/i.test(command) ||
        /\b(?:prisma|drizzle|typeorm)\s+(?:generate|migrate)\b/i.test(command);
}
function normalizeWorkspacePath(path) {
    const normalized = path.replace(/^\.\//, '').replace(/\/+$/, '');
    assert(isSafeScope(normalized), 'INVALID_SCOPE', `Unsafe workspace path: ${path}`);
    return normalized;
}
function literalPrefix(scope) {
    const segments = scope.split('/').filter(Boolean);
    const firstGlob = segments.findIndex((segment) => /[*?{}[\]]/.test(segment));
    return firstGlob === -1 ? segments : segments.slice(0, firstGlob);
}
function scopesOverlap(left, right) {
    const a = literalPrefix(left);
    const b = literalPrefix(right);
    const commonLength = Math.min(a.length, b.length);
    for (let index = 0; index < commonLength; index += 1) {
        if (a[index] !== b[index])
            return false;
    }
    return true;
}
function dependencyChainIncludes(tasks, blockedBy, targetTaskId) {
    const pending = [...blockedBy];
    const visited = new Set();
    while (pending.length > 0) {
        const dependency = pending.pop();
        if (dependency === targetTaskId)
            return true;
        if (visited.has(dependency))
            continue;
        visited.add(dependency);
        const record = tasks[dependency];
        if (record)
            pending.push(...record.workOrder.blockedBy);
    }
    return false;
}
export class DungeonService {
    runs = new Map();
    eventStore;
    idGenerator;
    clock;
    config;
    waiters = new Map();
    constructor(options) {
        this.eventStore = options.eventStore;
        this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
        this.clock = options.clock ?? (() => new Date().toISOString());
        this.config = resolveDungeonConfig({
            ...options.config,
            ...(options.taskLeaseDurationMs === undefined ? {} : { taskLeaseDurationMs: options.taskLeaseDurationMs }),
            ...(options.fingerprintIgnoreScopes === undefined ? {} : { fingerprintIgnoreScopes: options.fingerprintIgnoreScopes }),
        });
        for (const runId of this.eventStore.listRunIds?.() ?? [])
            this.recoverRun(runId);
    }
    startRun(input) {
        assert(typeof input.objective === 'string' && input.objective.trim(), 'INVALID_OBJECTIVE', 'Run objective is required');
        assert(input.tankSessionId, 'INVALID_TANK', 'Tank session is required');
        const runId = input.runId ?? this.idGenerator();
        const storedEvents = this.eventStore.load(runId);
        const existing = this.runs.get(runId) ?? (storedEvents.length > 0 ? this.recoverRun(runId) : undefined);
        if (existing) {
            const sameCommand = existing.objective === input.objective &&
                existing.workspaceRoot === input.workspaceRoot &&
                existing.workspaceFingerprint === input.workspaceFingerprint &&
                existing.slots.tank.currentSessionId === input.tankSessionId;
            assert(sameCommand, 'IDEMPOTENCY_CONFLICT', `Run ${runId} already exists with different start parameters`);
            return clone(existing);
        }
        const now = this.clock();
        const run = {
            id: runId,
            objective: input.objective,
            workspaceRoot: input.workspaceRoot,
            workspaceFingerprint: input.workspaceFingerprint,
            phase: 'FORMING',
            controlState: 'normal',
            scopeEnforcementMode: this.config.effectiveScopeEnforcementMode,
            taskSetVersion: 0,
            slots: createEmptySlots(runId),
            tasks: {},
            manifests: [],
            validationReports: [],
            checkpointRequests: [],
            messages: [],
            healthSignals: [],
            recoveryInstructions: [],
            commanderLoad: 'normal',
            battleResChargesRemaining: this.config.battleResCharges,
            commanderBattleResChargesRemaining: this.config.commanderBattleResCharges,
            resurrectionRequests: [],
            commanderRescueTickets: [],
            createdAt: now,
            updatedAt: now,
        };
        this.append(run, 'dungeon/run-created', {
            objective: run.objective,
            workspaceRoot: run.workspaceRoot,
            workspaceFingerprint: run.workspaceFingerprint,
            scopeEnforcementMode: run.scopeEnforcementMode,
            battleResCharges: this.config.battleResCharges,
            commanderBattleResCharges: this.config.commanderBattleResCharges,
            createdAt: now,
        }, input.tankSessionId);
        this.append(run, 'dungeon/member-bound', {
            slot: 'tank',
            sessionId: input.tankSessionId,
            generation: 1,
            boundAt: this.clock(),
        }, input.tankSessionId);
        return clone(this.requireRun(runId));
    }
    recoverRun(runId) {
        const events = this.eventStore.load(runId).sort((a, b) => a.sequence - b.sequence);
        assert(events.length > 0, 'RUN_NOT_FOUND', `Run ${runId} was not found`);
        let run;
        let expectedSequence = 1;
        for (const event of events) {
            assert(event.sequence === expectedSequence, 'EVENT_SEQUENCE_GAP', `Expected event sequence ${expectedSequence}`);
            assert(event.schemaVersion === 1, 'UNSUPPORTED_EVENT_VERSION', `Unsupported event schema ${event.schemaVersion}`);
            run = this.reduce(run, event);
            expectedSequence += 1;
        }
        assert(run, 'RUN_NOT_FOUND', `Run ${runId} was not found`);
        this.runs.set(runId, run);
        return clone(run);
    }
    bindMember(actor, runId, slot, sessionId) {
        const run = this.requireTank(actor, runId);
        this.assertMutable(run);
        const binding = run.slots[slot];
        assert(!binding.currentSessionId, 'SLOT_ALREADY_BOUND', `Slot ${slot} is already bound`);
        assert(!this.findSlot(run, sessionId), 'SESSION_ALREADY_BOUND', 'Session is already a party member');
        this.append(run, 'dungeon/member-bound', {
            slot,
            sessionId,
            generation: binding.generation + 1,
            boundAt: this.clock(),
        }, actor.sessionId);
        return clone(run);
    }
    changePhase(actor, runId, nextPhase) {
        const run = this.requireTank(actor, runId);
        if (run.phase === nextPhase)
            return clone(run);
        this.assertMutable(run);
        assert(phaseTransitions[run.phase].includes(nextPhase), 'INVALID_PHASE_TRANSITION', `Cannot move from ${run.phase} to ${nextPhase}`);
        if (nextPhase === 'EXECUTING') {
            assert(run.slots.healer.currentSessionId, 'HEALER_REQUIRED', 'A healer must be bound before execution');
        }
        if (nextPhase === 'VALIDATING') {
            this.assertRequiredTasksComplete(run);
        }
        this.append(run, 'dungeon/phase-changed', { previousPhase: run.phase, phase: nextPhase }, actor.sessionId);
        return clone(run);
    }
    createTask(actor, runId, workOrder) {
        const run = this.requireTank(actor, runId);
        this.assertMutable(run);
        assert(['PLANNING', 'REPAIR'].includes(run.phase), 'INVALID_PHASE', 'Tasks can only be created while planning or repairing');
        assert(workOrder.runId === runId, 'RUN_ID_MISMATCH', 'Work order runId does not match');
        const existingTask = run.tasks[workOrder.id];
        if (existingTask) {
            assert(JSON.stringify(existingTask.workOrder) === JSON.stringify(workOrder), 'IDEMPOTENCY_CONFLICT', `Task ${workOrder.id} already exists with different content`);
            return clone(existingTask);
        }
        assert(typeof workOrder.objective === 'string' && workOrder.objective.trim(), 'INVALID_TASK', 'Task objective is required');
        assert(Number.isSafeInteger(workOrder.version) && workOrder.version >= 1, 'INVALID_TASK_VERSION', 'Task version must be at least 1');
        assert(Array.isArray(workOrder.acceptanceCriteria) && workOrder.acceptanceCriteria.length > 0, 'INVALID_TASK', 'At least one acceptance criterion is required');
        assert(workOrder.globalCommands === undefined ||
            (Array.isArray(workOrder.globalCommands) && workOrder.globalCommands.every((command) => typeof command === 'string')), 'INVALID_GLOBAL_COMMAND', 'Global commands must be strings');
        const globalCommands = (workOrder.globalCommands ?? []).map(normalizeCommand);
        assert(globalCommands.every(Boolean), 'INVALID_GLOBAL_COMMAND', 'Global commands must not be empty');
        assert(new Set(globalCommands).size === globalCommands.length, 'INVALID_GLOBAL_COMMAND', 'Global commands must be unique within a work order');
        const ownedGlobalCommands = new Map(Object.values(run.tasks).flatMap((record) => (record.workOrder.globalCommands ?? []).map((command) => [normalizeCommand(command), record.workOrder.id])));
        for (const command of globalCommands) {
            assert(!ownedGlobalCommands.has(command), 'GLOBAL_COMMAND_CONFLICT', `Global command ${command} already belongs to ${ownedGlobalCommands.get(command)}`);
        }
        const existingCriterionIds = new Set(Object.values(run.tasks).flatMap((record) => record.workOrder.acceptanceCriteria.map((criterion) => criterion.id)));
        const localCriterionIds = new Set();
        for (const criterion of workOrder.acceptanceCriteria) {
            assert(criterion && typeof criterion.id === 'string' && criterion.id &&
                typeof criterion.description === 'string' && criterion.description.trim(), 'INVALID_CRITERION', 'Criteria need an id and description');
            assert(!existingCriterionIds.has(criterion.id) && !localCriterionIds.has(criterion.id), 'DUPLICATE_CRITERION', `Duplicate criterion ${criterion.id}`);
            localCriterionIds.add(criterion.id);
        }
        for (const scope of [...workOrder.readScopes, ...workOrder.writeScopes]) {
            assert(isSafeScope(scope), 'INVALID_SCOPE', `Unsafe workspace scope: ${scope}`);
        }
        for (const other of Object.values(run.tasks)) {
            const conflict = workOrder.writeScopes.some((scope) => other.workOrder.writeScopes.some((otherScope) => scopesOverlap(scope, otherScope)));
            const serializedByDag = dependencyChainIncludes(run.tasks, workOrder.blockedBy, other.workOrder.id);
            assert(!conflict || serializedByDag, 'WRITE_SCOPE_CONFLICT', `Task ${workOrder.id} overlaps write scopes with ${other.workOrder.id}`);
        }
        for (const dependency of workOrder.blockedBy) {
            assert(dependency !== workOrder.id, 'CYCLIC_DEPENDENCY', 'A task cannot block itself');
            assert(run.tasks[dependency], 'UNKNOWN_DEPENDENCY', `Unknown dependency ${dependency}`);
        }
        this.append(run, 'dungeon/task-created', { workOrder: clone(workOrder), taskSetVersion: run.taskSetVersion + 1 }, actor.sessionId);
        return clone(run.tasks[workOrder.id]);
    }
    preflightTaskAssignment(actor, runId, taskId, slot) {
        const run = this.requireTank(actor, runId);
        assert(run.phase === 'EXECUTING' || run.phase === 'REPAIR', 'INVALID_PHASE', `Task assignment requires EXECUTING or REPAIR; current phase is ${run.phase}. Call party_phase with phase=EXECUTING after all work orders are created.`);
        const task = this.requireTask(run, taskId);
        if (task.ownerSlot === slot && task.status === 'ready')
            return clone(task);
        assert(['pending', 'ready'].includes(task.status) && !task.ownerSlot, 'TASK_NOT_ASSIGNABLE', `Task ${taskId} cannot be assigned`);
        const unmet = task.workOrder.blockedBy.filter((dependency) => run.tasks[dependency]?.status !== 'completed');
        assert(unmet.length === 0, 'UNMET_DEPENDENCY', `Task is blocked by ${unmet.join(', ')}`);
        return clone(task);
    }
    assignTask(actor, runId, taskId, slot) {
        const task = this.preflightTaskAssignment(actor, runId, taskId, slot);
        if (task.ownerSlot === slot && task.status === 'ready')
            return task;
        const run = this.requireRun(runId);
        assert(run.slots[slot].currentSessionId, 'UNBOUND_SLOT', `Slot ${slot} is not bound`);
        this.append(run, 'dungeon/task-assigned', { taskId, ownerSlot: slot }, actor.sessionId);
        return clone(run.tasks[taskId]);
    }
    claimTask(actor, runId, taskId) {
        const run = this.requireRun(runId);
        assert(run.phase === 'EXECUTING', 'INVALID_PHASE', 'Tasks can only be claimed during execution');
        assert(run.controlState === 'normal', 'DISPATCH_BLOCKED', 'Run dispatch is not normal');
        const actorSlot = this.requireDps(run, actor.sessionId);
        const task = this.requireTask(run, taskId);
        assert(task.ownerSlot === actorSlot, 'FORBIDDEN', 'Task is not assigned to this DPS slot');
        assert(task.status === 'ready', 'TASK_NOT_CLAIMABLE', `Task ${taskId} is not ready`);
        assert(!task.activeLease, 'LEASE_EXISTS', 'Task already has an active lease');
        assert(run.slots.healer.currentSessionId, 'HEALER_REQUIRED', 'A healer must be bound before a write lease');
        const activeDps = new Set(Object.values(run.tasks).flatMap((candidate) => candidate.activeLease ? [candidate.activeLease.ownerSlot] : []));
        assert(activeDps.has(actorSlot) || activeDps.size < this.config.maxConcurrentDps, 'MAX_CONCURRENT_DPS', `At most ${this.config.maxConcurrentDps} DPS slots may hold leases concurrently`);
        if (run.scopeEnforcementMode === 'serial' && task.workOrder.writeScopes.length > 0) {
            const anotherWriter = Object.values(run.tasks).find((candidate) => candidate.workOrder.id !== taskId &&
                candidate.workOrder.writeScopes.length > 0 &&
                candidate.activeLease);
            assert(!anotherWriter, 'WRITE_DISPATCH_SERIALIZED', `Strict scope mode serializes write leases; ${anotherWriter?.workOrder.id} is active`);
        }
        const grantedAt = this.clock();
        const lease = {
            leaseId: this.idGenerator(),
            ownerSlot: actorSlot,
            grantedAt,
            expiresAt: new Date(Date.parse(grantedAt) + this.config.taskLeaseDurationMs).toISOString(),
            version: 1,
        };
        this.append(run, 'dungeon/task-lease-granted', {
            taskId,
            lease,
            nextCheckpointDueAt: new Date(Date.parse(grantedAt) + this.config.progressCheckpointIntervalMs).toISOString(),
        }, actor.sessionId);
        return clone(lease);
    }
    submitExecution(actor, runId, report) {
        const run = this.requireRun(runId);
        const actorSlot = this.requireDps(run, actor.sessionId);
        const task = this.requireTask(run, report.taskId);
        const binding = run.slots[actorSlot];
        assert(task.ownerSlot === actorSlot && report.slot === actorSlot, 'FORBIDDEN', 'Execution report slot does not match the owner');
        assert(binding.generation === report.generation, 'STALE_GENERATION', 'Execution report generation is stale');
        assert(task.workOrder.version === report.taskVersion, 'STALE_TASK', 'Execution report task version is stale');
        const priorReport = task.executionReports.find((item) => item.leaseId === report.leaseId && item.leaseVersion === report.leaseVersion);
        if (priorReport) {
            assert(JSON.stringify(priorReport) === JSON.stringify(report), 'IDEMPOTENCY_CONFLICT', 'The same lease report was already submitted with different content');
            return clone(task);
        }
        assert(task.activeLease, 'STALE_LEASE', 'Task has no active lease');
        assert(task.activeLease.leaseId === report.leaseId && task.activeLease.version === report.leaseVersion, 'STALE_LEASE', 'Execution report lease does not match the active lease');
        assert(Date.parse(this.clock()) <= Date.parse(task.activeLease.expiresAt), 'LEASE_EXPIRED', 'Task lease has expired');
        assert(typeof report.summary === 'string' && report.summary.trim(), 'INVALID_REPORT', 'Execution summary is required');
        assert(Array.isArray(report.changedFiles) && Array.isArray(report.evidence) && Array.isArray(report.commandsRun) &&
            Array.isArray(report.risks) && Array.isArray(report.remainingWork), 'INVALID_REPORT', 'Execution report list fields are required');
        assert(report.commandsRun.every((item) => item && typeof item.command === 'string' && typeof item.summary === 'string'), 'INVALID_REPORT', 'commandsRun entries are invalid');
        assert(report.evidence.length > 0 || report.status !== 'completed', 'INVALID_REPORT', 'Completed work needs evidence');
        const globalCommandOwners = new Map(Object.values(run.tasks).flatMap((record) => (record.workOrder.globalCommands ?? []).map((command) => [normalizeCommand(command), record.workOrder.id])));
        const ownedCommands = new Set((task.workOrder.globalCommands ?? []).map(normalizeCommand));
        for (const commandResult of report.commandsRun) {
            const command = normalizeCommand(commandResult.command);
            const owner = globalCommandOwners.get(command);
            assert(!owner || owner === report.taskId, 'GLOBAL_COMMAND_CONFLICT', `Global command ${command} belongs to ${owner}`);
            assert(!isWorkspaceGlobalCommand(command) || ownedCommands.has(command), 'GLOBAL_COMMAND_UNOWNED', `Workspace-global command ${command} is not owned by this task`);
        }
        for (const changedFile of report.changedFiles) {
            const normalizedFile = normalizeWorkspacePath(changedFile);
            assert(!/[?*\[\]{}]/.test(normalizedFile), 'INVALID_SCOPE', `Changed file must be a literal workspace path: ${changedFile}`);
            assert(task.workOrder.writeScopes.some((scope) => normalizedFile === scope || matchesGlob(normalizedFile, scope)), 'WRITE_SCOPE_VIOLATION', `Changed file ${changedFile} is outside the task write scopes`);
        }
        this.append(run, 'dungeon/task-submitted', { report: clone(report) }, actor.sessionId);
        return clone(run.tasks[report.taskId]);
    }
    markMemberDown(runId, slot, reason) {
        const run = this.requireRun(runId);
        this.assertMutable(run);
        assert(typeof reason === 'string' && reason.trim(), 'FAILURE_REASON_REQUIRED', 'A member failure reason is required');
        assert(run.slots[slot].currentSessionId, 'UNBOUND_SLOT', `Slot ${slot} is not bound`);
        if (run.slots[slot].lifeState !== 'down') {
            this.append(run, 'dungeon/member-down', { slot, reason });
        }
        for (const task of Object.values(run.tasks)) {
            if (task.ownerSlot === slot && task.activeLease) {
                this.append(run, 'dungeon/task-lease-revoked', {
                    taskId: task.workOrder.id,
                    leaseId: task.activeLease.leaseId,
                    leaseVersion: task.activeLease.version,
                    reason: 'member-down',
                });
            }
        }
        return clone(run);
    }
    observeAgentDisposed(sessionId, reason) {
        const affected = [];
        for (const run of [...this.runs.values()]) {
            if (terminalPhases.includes(run.phase))
                continue;
            const slot = this.findSlot(run, sessionId);
            if (!slot)
                continue;
            if (slot === 'tank') {
                this.markCommanderUnavailable(run.id, reason);
            }
            else if (slot === 'healer') {
                this.append(run, 'dungeon/member-readiness-changed', {
                    slot,
                    readiness: 'unavailable',
                    signalIds: [],
                });
            }
            else {
                this.markMemberDown(run.id, slot, reason);
            }
            affected.push(this.getRun(run.id));
        }
        return affected;
    }
    requestBattleRes(actor, runId, slot, resurrectionId = this.idGenerator()) {
        const run = this.requireTank(actor, runId);
        const existing = run.resurrectionRequests.find((request) => request.resurrectionId === resurrectionId);
        if (existing)
            return clone(existing);
        const binding = run.slots[slot];
        assert(binding.currentSessionId && binding.lifeState === 'down', 'MEMBER_NOT_DOWN', `Battle resurrection is only valid after runtime health evidence marks ${slot} down; current lifeState is ${binding.lifeState}. For a stalled but alive DPS, use party_request_checkpoint or party_interrupt instead.`);
        assert(run.battleResChargesRemaining > 0, 'NO_BATTLE_RES_CHARGES', 'No DPS battle resurrection charges remain');
        assert(binding.generation < this.config.maxGenerationsPerSlot, 'MAX_GENERATION_REACHED', 'DPS slot reached its maximum generation');
        const requestedAt = this.clock();
        const request = {
            resurrectionId,
            runId,
            targetSlot: slot,
            targetSessionId: binding.currentSessionId,
            status: 'issued',
            requestedAt,
            expiresAt: new Date(Date.parse(requestedAt) + this.config.resurrectionTimeoutMs).toISOString(),
        };
        this.append(run, 'dungeon/resurrection-requested', { request }, actor.sessionId);
        return clone(request);
    }
    startBattleRes(actor, runId, resurrectionId) {
        const run = this.requireRun(runId);
        assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can consume a battle resurrection');
        const request = run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId);
        assert(request, 'RESURRECTION_NOT_FOUND', 'Battle resurrection request was not found');
        assert(request.status === 'issued', 'RESURRECTION_ALREADY_CONSUMED', 'Battle resurrection request is no longer available');
        assert(Date.parse(this.clock()) <= Date.parse(request.expiresAt), 'RESURRECTION_EXPIRED', 'Battle resurrection request expired');
        this.append(run, 'dungeon/resurrection-started', { resurrectionId }, actor.sessionId);
        return clone(run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId));
    }
    completeBattleRes(actor, runId, resurrectionId, outcome) {
        const run = this.requireRun(runId);
        assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can complete battle resurrection');
        const request = run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId);
        assert(request?.status === 'consumed', 'RESURRECTION_NOT_ACTIVE', 'Battle resurrection is not active');
        if (Date.parse(this.clock()) > Date.parse(request.expiresAt)) {
            this.append(run, 'dungeon/resurrection-failed', {
                resurrectionId,
                slot: request.targetSlot,
                previousSessionId: request.targetSessionId,
                sessionId: request.targetSessionId,
                generation: run.slots[request.targetSlot].generation,
                completedAt: this.clock(),
                chargeOnFailure: this.config.chargeOnFailedResurrection,
                reason: 'expired',
            }, actor.sessionId);
            throw new DungeonError('RESURRECTION_EXPIRED', 'Battle resurrection expired before completion');
        }
        const binding = run.slots[request.targetSlot];
        if (outcome.success && outcome.mode === 'resume') {
            assert(outcome.sessionId === request.targetSessionId, 'SESSION_MISMATCH', 'Resume must restore the original DPS Session');
        }
        if (outcome.success && outcome.mode === 'replace') {
            assert(outcome.sessionId !== request.targetSessionId, 'SESSION_MISMATCH', 'Replacement must use a new DPS Session');
            assert(binding.generation < this.config.maxGenerationsPerSlot, 'MAX_GENERATION_REACHED', 'DPS slot reached its maximum generation');
        }
        this.append(run, outcome.success && outcome.mode === 'replace' ? 'dungeon/member-rebound' : outcome.success ? 'dungeon/resurrection-completed' : 'dungeon/resurrection-failed', {
            resurrectionId,
            slot: request.targetSlot,
            previousSessionId: request.targetSessionId,
            sessionId: outcome.sessionId,
            generation: outcome.mode === 'replace' ? binding.generation + 1 : binding.generation,
            completedAt: this.clock(),
            chargeOnFailure: this.config.chargeOnFailedResurrection,
        }, actor.sessionId);
        return clone(run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId));
    }
    markCommanderUnavailable(runId, reason) {
        const run = this.requireRun(runId);
        const existing = run.commanderRescueTickets.find((ticket) => ticket.status === 'issued' || ticket.status === 'consumed');
        if (existing)
            return clone(existing);
        const tankSessionId = run.slots.tank.currentSessionId;
        const healerSessionId = run.slots.healer.currentSessionId;
        assert(tankSessionId && healerSessionId, 'PARTY_NOT_RECOVERABLE', 'Tank and healer must both be bound');
        assert(run.commanderBattleResChargesRemaining > 0, 'NO_COMMANDER_RES_CHARGES', 'No commander resurrection charges remain');
        this.append(run, 'dungeon/member-down', { slot: 'tank', reason });
        this.append(run, 'dungeon/dispatch-paused', { reason: 'commander-unavailable' });
        const checkpoint = this.buildCommanderCheckpoint(run, []);
        this.append(run, 'dungeon/commander-checkpointed', { checkpoint });
        const issuedAt = this.clock();
        const ticket = {
            ticketId: this.idGenerator(),
            runId,
            targetSlot: 'tank',
            targetSessionId: tankSessionId,
            healerSessionId,
            commanderCheckpointId: checkpoint.checkpointId,
            status: 'issued',
            issuedAt,
            expiresAt: new Date(Date.parse(issuedAt) + this.config.commanderRescueTicketTtlMs).toISOString(),
            version: 1,
        };
        this.append(run, 'dungeon/commander-rescue-ticket-issued', { ticket });
        return clone(ticket);
    }
    consumeCommanderRescueTicket(actor, runId, ticketId) {
        const run = this.requireRun(runId);
        assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can consume commander rescue tickets');
        const ticket = run.commanderRescueTickets.find((item) => item.ticketId === ticketId);
        assert(ticket, 'TICKET_NOT_FOUND', 'Commander rescue ticket was not found');
        assert(ticket.status === 'issued', 'TICKET_ALREADY_CONSUMED', 'Commander rescue ticket is no longer available');
        assert(Date.parse(this.clock()) <= Date.parse(ticket.expiresAt), 'TICKET_EXPIRED', 'Commander rescue ticket expired');
        this.append(run, 'dungeon/commander-rescue-ticket-consumed', {
            ticketId,
            recoveryExpiresAt: new Date(Date.parse(this.clock()) + this.config.commanderResurrectionTimeoutMs).toISOString(),
        }, actor.sessionId);
        return clone(run.commanderRescueTickets.find((item) => item.ticketId === ticketId));
    }
    expireCommanderRescueTickets(runId) {
        const run = this.requireRun(runId);
        const now = Date.parse(this.clock());
        for (const ticket of run.commanderRescueTickets.filter((item) => item.status === 'issued' && now > Date.parse(item.expiresAt))) {
            this.append(run, 'dungeon/commander-rescue-ticket-expired', { ticketId: ticket.ticketId });
        }
        return clone(run);
    }
    sweepExpiredState(runId) {
        const run = this.requireRun(runId);
        if (terminalPhases.includes(run.phase))
            return clone(run);
        const now = Date.parse(this.clock());
        for (const task of Object.values(run.tasks)) {
            if (task.activeLease && now > Date.parse(task.activeLease.expiresAt)) {
                this.append(run, 'dungeon/task-lease-revoked', {
                    taskId: task.workOrder.id,
                    leaseId: task.activeLease.leaseId,
                    leaseVersion: task.activeLease.version,
                    reason: 'lease-expired',
                });
            }
        }
        for (const request of run.checkpointRequests.filter((item) => item.status === 'issued' && now > Date.parse(item.dueAt))) {
            this.append(run, 'dungeon/checkpoint-request-expired', { requestId: request.requestId });
        }
        for (const instruction of run.recoveryInstructions.filter((item) => item.status === 'issued' && now > Date.parse(item.expiresAt))) {
            this.append(run, 'dungeon/member-recovery-completed', {
                instructionId: instruction.instructionId,
                success: false,
                completedAt: this.clock(),
                reason: 'expired',
            });
        }
        for (const request of run.resurrectionRequests.filter((item) => (item.status === 'issued' || item.status === 'consumed') && now > Date.parse(item.expiresAt))) {
            this.append(run, 'dungeon/resurrection-failed', {
                resurrectionId: request.resurrectionId,
                slot: request.targetSlot,
                previousSessionId: request.targetSessionId,
                sessionId: request.targetSessionId,
                generation: run.slots[request.targetSlot].generation,
                completedAt: this.clock(),
                chargeOnFailure: this.config.chargeOnFailedResurrection,
                reason: 'expired',
            });
        }
        this.expireCommanderRescueTickets(runId);
        for (const ticket of run.commanderRescueTickets.filter((item) => item.status === 'consumed' && now > Date.parse(item.recoveryExpiresAt ?? item.expiresAt))) {
            this.append(run, 'dungeon/commander-resurrection-failed', {
                ticketId: ticket.ticketId,
                completedAt: this.clock(),
                reason: 'expired',
            });
        }
        return clone(run);
    }
    completeCommanderResurrection(actor, runId, ticketId, outcome) {
        const run = this.requireRun(runId);
        assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can complete commander resurrection');
        const ticket = run.commanderRescueTickets.find((item) => item.ticketId === ticketId);
        assert(ticket?.status === 'consumed', 'TICKET_NOT_ACTIVE', 'Commander rescue ticket is not active');
        if (Date.parse(this.clock()) > Date.parse(ticket.recoveryExpiresAt ?? ticket.expiresAt)) {
            this.append(run, 'dungeon/commander-resurrection-failed', {
                ticketId,
                completedAt: this.clock(),
                reason: 'expired',
            }, actor.sessionId);
            throw new DungeonError('TICKET_EXPIRED', 'Commander rescue ticket expired before completion');
        }
        assert(outcome.sessionId === ticket.targetSessionId, 'COMMANDER_REPLACE_FORBIDDEN', 'Commander resurrection may only restore the original Lead Session');
        this.append(run, outcome.success ? 'dungeon/commander-resurrection-completed' : 'dungeon/commander-resurrection-failed', {
            ticketId,
            completedAt: this.clock(),
        }, actor.sessionId);
        return clone(run.commanderRescueTickets.find((item) => item.ticketId === ticketId));
    }
    recoverRunAfterCommanderReturn(actor, runId) {
        let run = this.requireTank(actor, runId);
        this.assertMutable(run);
        if (run.controlState === 'normal' && run.slots.tank.lifeState === 'alive')
            return clone(run);
        this.sweepExpiredState(runId);
        run = this.requireTank(actor, runId);
        const ticket = run.commanderRescueTickets.find((item) => item.status === 'issued' || item.status === 'consumed');
        this.append(run, 'dungeon/commander-returned', {
            resumedAt: this.clock(),
            ...(ticket ? { ticketId: ticket.ticketId, refundCharge: ticket.status === 'issued' } : {}),
        }, actor.sessionId);
        return clone(run);
    }
    resumeDispatch(actor, runId) {
        const run = this.requireTank(actor, runId);
        assert(run.controlState === 'recovering' || run.controlState === 'throttled', 'DISPATCH_NOT_PAUSED', 'Dispatch is not ready to resume');
        assert(run.slots.tank.readiness === 'recovering' || run.commanderLoad !== 'unavailable', 'COMMANDER_NOT_RECOVERED', 'Commander is not recovered');
        this.append(run, 'dungeon/dispatch-resumed', { resumedAt: this.clock() }, actor.sessionId);
        return clone(run);
    }
    observeAgentTurnEnd(sessionId, reason, evidence) {
        if (reason === 'completed' || reason === 'aborted')
            return [];
        const signals = [];
        for (const run of this.runs.values()) {
            if (terminalPhases.includes(run.phase))
                continue;
            const slot = this.findSlot(run, sessionId);
            if (!slot)
                continue;
            const severity = reason === 'error' || reason === 'interrupted' ? 'critical' : 'warning';
            const kind = reason === 'error'
                ? 'turn-error'
                : reason === 'interrupted'
                    ? 'timeout'
                    : reason === 'max-tokens'
                        ? 'context-pressure'
                        : 'progress-stall';
            signals.push(this.observeHealthSignal(run.id, {
                slot,
                source: 'runtime',
                kind,
                severity,
                windowMs: this.config.readinessEvaluationWindowMs,
                evidence,
            }));
        }
        return signals;
    }
    observeHealthSignal(runId, input) {
        const run = this.requireRun(runId);
        this.assertMutable(run);
        assert(run.slots[input.slot].currentSessionId, 'UNBOUND_SLOT', `Slot ${input.slot} is not bound`);
        assert(input.evidence.length > 0, 'MISSING_EVIDENCE', 'Health signals require evidence');
        assert(input.windowMs > 0, 'INVALID_HEALTH_SIGNAL', 'Health signal window must be positive');
        const observedAt = this.clock();
        const priorVersion = run.healthSignals
            .filter((signal) => signal.slot === input.slot)
            .reduce((maximum, signal) => Math.max(maximum, signal.version), 0);
        const signal = {
            ...clone(input),
            id: this.idGenerator(),
            runId,
            observedAt,
            version: priorVersion + 1,
        };
        this.append(run, 'dungeon/member-health-signal-raised', { signal });
        const cutoff = Date.parse(observedAt) - this.config.readinessEvaluationWindowMs;
        const recent = run.healthSignals.filter((item) => item.slot === input.slot && Date.parse(item.observedAt) >= cutoff);
        const criticalCount = recent.filter((item) => item.severity === 'critical').length;
        const warningCount = recent.filter((item) => item.severity === 'warning').length;
        const nextReadiness = criticalCount >= this.config.readinessCriticalSignalCount
            ? 'unavailable'
            : warningCount >= this.config.readinessWarningSignalCount
                ? 'degraded'
                : undefined;
        if (nextReadiness && run.slots[input.slot].readiness !== nextReadiness) {
            this.append(run, 'dungeon/member-readiness-changed', {
                slot: input.slot,
                readiness: nextReadiness,
                signalIds: recent.map((item) => item.id),
            });
            if (nextReadiness === 'unavailable' && input.slot === 'tank') {
                this.markCommanderUnavailable(runId, `objective health signals: ${recent.map((item) => item.id).join(', ')}`);
            }
            else if (nextReadiness === 'unavailable' && input.slot.startsWith('dps-')) {
                this.markMemberDown(runId, input.slot, `objective health signals: ${recent.map((item) => item.id).join(', ')}`);
            }
        }
        return clone(signal);
    }
    directValidatorMaintenance(actor, runId) {
        const run = this.requireTank(actor, runId);
        assert(run.slots.healer.currentSessionId, 'HEALER_REQUIRED', 'A healer must be bound');
        assert(run.slots.healer.readiness === 'degraded', 'INVALID_READINESS', 'Healer must be degraded but responsive');
        assert(!run.recoveryInstructions.some((instruction) => instruction.status === 'issued'), 'RECOVERY_IN_PROGRESS', 'Healer already has an active recovery instruction');
        const issuedAt = this.clock();
        const instruction = {
            instructionId: this.idGenerator(),
            runId,
            slot: 'healer',
            action: 'validator-maintenance',
            status: 'issued',
            issuedAt,
            expiresAt: new Date(Date.parse(issuedAt) + this.config.resurrectionTimeoutMs).toISOString(),
        };
        this.append(run, 'dungeon/member-recovery-directed', { instruction }, actor.sessionId);
        return clone(instruction);
    }
    completeValidatorMaintenance(actor, runId, instructionId, success) {
        const run = this.requireRun(runId);
        assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can complete maintenance');
        const instruction = run.recoveryInstructions.find((item) => item.instructionId === instructionId);
        assert(instruction?.status === 'issued', 'STALE_RECOVERY_INSTRUCTION', 'Recovery instruction is not active');
        this.append(run, success ? 'dungeon/member-recovery-completed' : 'dungeon/member-recovery-failed', {
            instructionId,
            completedAt: this.clock(),
        }, actor.sessionId);
        return clone(run.recoveryInstructions.find((item) => item.instructionId === instructionId));
    }
    registerTaskTurn(runId, taskId, turnId) {
        const run = this.requireRun(runId);
        const task = this.requireTask(run, taskId);
        assert(task.status === 'running' && task.activeLease, 'TASK_NOT_RUNNING', 'Only a running leased task can register a Turn');
        assert(typeof turnId === 'string' && turnId.trim(), 'TURN_ID_REQUIRED', 'Turn id is required');
        this.append(run, 'dungeon/task-turn-registered', { taskId, turnId });
        return clone(run.tasks[taskId]);
    }
    requestTaskInterrupt(actor, runId, taskId, turnId) {
        const run = this.requireTank(actor, runId);
        const task = this.requireTask(run, taskId);
        assert(task.progressState === 'stalled', 'TASK_NOT_STALLED', 'Only a confirmed stalled task can be interrupted');
        assert(task.currentTurnId === turnId, 'TURN_ID_MISMATCH', 'Interrupt must reference the exact active Turn');
        assert(!task.interruptState, 'INTERRUPT_ALREADY_REQUESTED', 'Task interrupt already exists');
        this.append(run, 'dungeon/task-interrupt-requested', { taskId, turnId }, actor.sessionId);
        return clone(run.tasks[taskId]);
    }
    completeTaskInterrupt(runId, taskId, turnId, result) {
        const run = this.requireRun(runId);
        const task = this.requireTask(run, taskId);
        assert(task.interruptState === 'requested', 'INTERRUPT_NOT_REQUESTED', 'Task interrupt was not requested');
        assert(task.currentTurnId === turnId, 'TURN_ID_MISMATCH', 'Interrupt result must reference the active Turn');
        this.append(run, result.success ? 'dungeon/task-interrupt-completed' : 'dungeon/task-interrupt-failed', {
            taskId,
            turnId,
            quarantinedFiles: clone(result.quarantinedFiles),
        });
        if (result.success && task.activeLease) {
            this.append(run, 'dungeon/task-lease-revoked', {
                taskId,
                leaseId: task.activeLease.leaseId,
                leaseVersion: task.activeLease.version,
                reason: 'turn-interrupted',
            });
        }
        if (result.success && result.quarantinedFiles.length > 0) {
            this.append(run, 'dungeon/workspace-changes-quarantined', {
                taskId,
                files: clone(result.quarantinedFiles),
                turnId,
            });
        }
        return clone(run.tasks[taskId]);
    }
    reviewQuarantinedChanges(actor, runId, taskId) {
        const run = this.requireTank(actor, runId);
        const task = this.requireTask(run, taskId);
        assert(task.quarantinedFiles?.length, 'NO_QUARANTINED_CHANGES', 'Task has no quarantined changes');
        this.append(run, 'dungeon/workspace-quarantine-reviewed', { taskId }, actor.sessionId);
        return clone(run.tasks[taskId]);
    }
    reassignTask(actor, runId, taskId, ownerSlot) {
        const run = this.requireTank(actor, runId);
        const task = this.requireTask(run, taskId);
        assert(task.interruptState === 'completed', 'INTERRUPT_NOT_CONFIRMED', 'Original Turn termination is not confirmed');
        assert(!task.activeLease, 'ACTIVE_LEASE_EXISTS', 'Old lease must be revoked before reassignment');
        assert(!task.quarantinedFiles?.length || task.quarantineReviewed, 'QUARANTINE_REVIEW_REQUIRED', 'Quarantined workspace changes require tank review');
        assert(run.slots[ownerSlot].currentSessionId, 'UNBOUND_SLOT', `Slot ${ownerSlot} is not bound`);
        assert(task.ownerSlot !== ownerSlot, 'OWNER_UNCHANGED', 'Choose a different DPS owner');
        this.append(run, 'dungeon/task-owner-reassigned', {
            taskId,
            previousOwnerSlot: task.ownerSlot,
            ownerSlot,
        }, actor.sessionId);
        return clone(run.tasks[taskId]);
    }
    evaluateTaskProgress(runId, taskId, observations) {
        const run = this.requireRun(runId);
        const task = this.requireTask(run, taskId);
        assert(task.status === 'running' && task.activeLease, 'TASK_NOT_RUNNING', 'Only a leased running task can be evaluated');
        if (observations.hasActiveLongTask || observations.hasRecentActivity || observations.hasBlockedEvidence) {
            return clone(task);
        }
        const now = Date.parse(this.clock());
        const due = Date.parse(task.nextCheckpointDueAt ?? task.activeLease.grantedAt);
        if (now <= due + this.config.checkpointResponseTimeoutMs)
            return clone(task);
        const missedCheckpoints = (task.missedCheckpoints ?? 0) + 1;
        const progressState = missedCheckpoints >= this.config.maxMissedCheckpoints ? 'stalled' : 'suspected-stalled';
        this.append(run, progressState === 'stalled' ? 'dungeon/task-stall-confirmed' : 'dungeon/task-stall-suspected', {
            taskId,
            progressState,
            missedCheckpoints,
            nextCheckpointDueAt: new Date(now + this.config.progressCheckpointIntervalMs).toISOString(),
            evidence: ['checkpoint response window elapsed without registered activity or blocker'],
        });
        return clone(run.tasks[taskId]);
    }
    requestTaskCheckpoint(actor, runId, taskId) {
        const run = this.requireTank(actor, runId);
        const task = this.requireTask(run, taskId);
        assert(task.status === 'running' && task.activeLease && task.ownerSlot, 'TASK_NOT_RUNNING', 'Checkpoint requests require a running leased task');
        const existing = run.checkpointRequests.find((request) => request.taskId === taskId &&
            request.leaseId === task.activeLease?.leaseId &&
            request.leaseVersion === task.activeLease.version &&
            request.status === 'issued');
        if (existing)
            return clone(existing);
        const issuedAt = this.clock();
        const request = {
            requestId: this.idGenerator(),
            runId,
            taskId,
            taskVersion: task.workOrder.version,
            leaseId: task.activeLease.leaseId,
            leaseVersion: task.activeLease.version,
            slot: task.ownerSlot,
            status: 'issued',
            issuedAt,
            dueAt: new Date(Date.parse(issuedAt) + this.config.checkpointResponseTimeoutMs).toISOString(),
        };
        this.append(run, 'dungeon/checkpoint-requested', { request }, actor.sessionId);
        return clone(request);
    }
    submitCheckpoint(actor, runId, checkpoint) {
        const run = this.requireRun(runId);
        const actorSlot = this.requireDps(run, actor.sessionId);
        const task = this.requireTask(run, checkpoint.taskId);
        assert(task.ownerSlot === actorSlot && checkpoint.slot === actorSlot, 'FORBIDDEN', 'Checkpoint owner does not match');
        assert(task.workOrder.version === checkpoint.taskVersion, 'STALE_TASK', 'Checkpoint task version is stale');
        assert(task.activeLease?.leaseId === checkpoint.leaseId && task.activeLease.version === checkpoint.leaseVersion, 'STALE_LEASE', 'Checkpoint lease is stale');
        assert(Date.parse(this.clock()) <= Date.parse(task.activeLease.expiresAt), 'LEASE_EXPIRED', 'Task lease has expired');
        assert(Array.isArray(checkpoint.completed) && Array.isArray(checkpoint.nextSteps) &&
            Array.isArray(checkpoint.evidenceDelta) && Array.isArray(checkpoint.blockers), 'INVALID_CHECKPOINT', 'Checkpoint list fields are required');
        assert(checkpoint.evidenceDelta.length > 0 || checkpoint.blockers.length > 0, 'MISSING_EVIDENCE', 'Checkpoint needs progress or blocker evidence');
        const observedAt = this.clock();
        const renewedLease = {
            ...task.activeLease,
            version: task.activeLease.version + 1,
            expiresAt: new Date(Date.parse(observedAt) + this.config.taskLeaseDurationMs).toISOString(),
        };
        this.append(run, 'dungeon/checkpoint-submitted', {
            checkpoint: { ...clone(checkpoint), observedAt },
            renewedLease,
            nextCheckpointDueAt: new Date(Date.parse(observedAt) + this.config.progressCheckpointIntervalMs).toISOString(),
        }, actor.sessionId);
        return clone(run.tasks[checkpoint.taskId]);
    }
    observeCommanderLoad(runId, observation) {
        const run = this.requireRun(runId);
        this.assertMutable(run);
        const countExceeded = observation.pendingDecisionIds.length >= this.config.commanderMaxPendingDecisions;
        const slaExceeded = observation.oldestDecisionAgeMs >= this.config.commanderDecisionSlaMs;
        const commanderLoad = observation.criticalSignal || (countExceeded && slaExceeded)
            ? 'overloaded'
            : countExceeded || slaExceeded
                ? 'pressured'
                : 'normal';
        if (run.commanderLoad !== commanderLoad) {
            this.append(run, 'dungeon/commander-load-changed', { commanderLoad, ...clone(observation) });
        }
        if (commanderLoad === 'overloaded' && run.controlState !== 'throttled') {
            this.append(run, 'dungeon/dispatch-throttled', { reason: 'commander-overloaded' });
            const checkpoint = {
                checkpointId: this.idGenerator(),
                runId,
                phase: run.phase,
                controlState: 'throttled',
                taskSetVersion: run.taskSetVersion,
                pendingDecisionIds: clone(observation.pendingDecisionIds),
                activeLeaseIds: Object.values(run.tasks).flatMap((task) => task.activeLease ? [task.activeLease.leaseId] : []),
                memberReadiness: Object.fromEntries(slots.flatMap((slot) => run.slots[slot].readiness ? [[slot, run.slots[slot].readiness]] : [])),
                workspaceFingerprint: run.workspaceFingerprint,
                createdAt: this.clock(),
            };
            this.append(run, 'dungeon/commander-checkpointed', { checkpoint });
        }
        return clone(run);
    }
    reopenTask(actor, runId, taskId, findingIds) {
        const run = this.requireTank(actor, runId);
        assert(run.phase === 'REPAIR', 'INVALID_PHASE', 'Tasks can only be reopened during repair');
        const task = this.requireTask(run, taskId);
        const latestReport = run.validationReports.at(-1);
        assert(latestReport?.verdict === 'fail', 'FAILED_VALIDATION_REQUIRED', 'A failed validation report is required');
        assert(findingIds.length > 0, 'FINDINGS_REQUIRED', 'At least one finding must justify repair');
        const availableFindings = new Set(latestReport.findings
            .filter((finding) => finding.ownerTaskId === taskId)
            .map((finding) => finding.id));
        assert(findingIds.every((id) => availableFindings.has(id)), 'UNKNOWN_FINDING', 'Repair findings must belong to the task');
        if (task.repairRound >= this.config.maxRepairRounds) {
            this.append(run, 'dungeon/run-failed', {
                reason: 'repair-limit-exceeded',
                taskId,
                maxRepairRounds: this.config.maxRepairRounds,
            }, actor.sessionId);
            throw new DungeonError('REPAIR_LIMIT_EXCEEDED', `Task ${taskId} exceeded the repair limit`);
        }
        this.append(run, 'dungeon/task-reopened', {
            taskId,
            findingIds: clone(findingIds),
            taskVersion: task.workOrder.version + 1,
            taskSetVersion: run.taskSetVersion + 1,
            repairRound: task.repairRound + 1,
        }, actor.sessionId);
        return clone(run.tasks[taskId]);
    }
    observeWorkspaceFingerprint(runId, workspaceFingerprint) {
        const run = this.requireRun(runId);
        this.assertMutable(run);
        if (run.workspaceFingerprint === workspaceFingerprint)
            return clone(run);
        this.append(run, 'dungeon/workspace-fingerprint-observed', {
            previousFingerprint: run.workspaceFingerprint,
            workspaceFingerprint,
        });
        return clone(run);
    }
    createValidationManifest(actor, runId, workspaceFingerprint) {
        const run = this.requireRun(runId);
        const actorSlot = this.findSlot(run, actor.sessionId);
        assert(actorSlot === 'tank' || actorSlot === 'healer', 'FORBIDDEN', 'Only tank or healer can access validation manifests');
        assert(run.phase === 'VALIDATING', 'INVALID_PHASE', 'Validation manifest requires VALIDATING phase');
        this.assertRequiredTasksComplete(run);
        const latest = run.manifests.at(-1);
        if (latest && latest.taskSetVersion === run.taskSetVersion && latest.workspaceFingerprint === workspaceFingerprint) {
            return clone(latest);
        }
        assert(actorSlot === 'tank', 'MANIFEST_REFRESH_REQUIRED', 'Only tank can create a manifest for a changed workspace');
        const manifest = {
            runId,
            manifestVersion: (latest?.manifestVersion ?? 0) + 1,
            taskSetVersion: run.taskSetVersion,
            workspaceFingerprint,
            criteria: Object.values(run.tasks).flatMap((record) => record.workOrder.acceptanceCriteria.map((criterion) => ({
                criterionId: criterion.id,
                taskId: record.workOrder.id,
                taskVersion: record.workOrder.version,
                description: criterion.description,
                required: record.workOrder.required && criterion.required,
            }))),
            fingerprintIgnoreScopes: clone(this.config.fingerprintIgnoreScopes),
            createdAt: this.clock(),
        };
        this.append(run, 'dungeon/validation-manifest-created', { manifest }, actor.sessionId);
        return clone(manifest);
    }
    submitValidation(actor, runId, submission) {
        const run = this.requireRun(runId);
        const healerSlot = this.findSlot(run, actor.sessionId);
        assert(healerSlot === 'healer', 'FORBIDDEN', 'Only the bound healer can submit validation');
        assert(run.phase === 'VALIDATING', 'INVALID_PHASE', 'Run is not validating');
        assert(Array.isArray(submission.checks) && Array.isArray(submission.findings), 'INVALID_VALIDATION', 'Validation checks and findings are required');
        assert(typeof submission.summary === 'string' && submission.summary.trim(), 'INVALID_VALIDATION', 'Validation summary is required');
        const priorReport = run.validationReports.find((report) => report.validationId === submission.validationId);
        if (priorReport) {
            const candidate = {
                ...clone(submission),
                runId,
                status: priorReport.status,
                createdAt: priorReport.createdAt,
            };
            assert(JSON.stringify(priorReport) === JSON.stringify(candidate), 'IDEMPOTENCY_CONFLICT', `Validation ${submission.validationId} was already submitted with different content`);
            return clone(priorReport);
        }
        const manifest = run.manifests.at(-1);
        assert(manifest, 'MANIFEST_REQUIRED', 'A validation manifest is required');
        assert(submission.manifestVersion === manifest.manifestVersion &&
            submission.taskSetVersion === manifest.taskSetVersion &&
            submission.workspaceFingerprint === manifest.workspaceFingerprint, 'STALE_VALIDATION', 'Validation report does not match the current manifest');
        const manifestById = new Map(manifest.criteria.map((criterion) => [criterion.criterionId, criterion]));
        const seen = new Set();
        for (const check of submission.checks) {
            assert(check && typeof check.criterionId === 'string' && Array.isArray(check.evidence), 'INVALID_VALIDATION', 'Validation check is malformed');
            const criterion = manifestById.get(check.criterionId);
            assert(criterion, 'UNKNOWN_CRITERION', `Unknown criterion ${check.criterionId}`);
            assert(!seen.has(check.criterionId), 'DUPLICATE_CHECK', `Duplicate check ${check.criterionId}`);
            seen.add(check.criterionId);
            if (check.status === 'not-applicable') {
                assert(!criterion.required && check.notApplicableReason?.trim(), 'INVALID_NOT_APPLICABLE', 'Required criteria cannot be N/A and optional N/A needs a reason');
            }
            if (check.status === 'fail' || check.status === 'blocked') {
                assert(check.evidence.length > 0, 'MISSING_EVIDENCE', 'Failed or blocked checks need evidence');
            }
        }
        if (submission.verdict === 'pass') {
            const required = manifest.criteria.filter((criterion) => criterion.required);
            const allPassed = required.every((criterion) => {
                const check = submission.checks.find((item) => item.criterionId === criterion.criterionId);
                return check?.status === 'pass';
            });
            assert(allPassed, 'INCOMPLETE_VALIDATION', 'Pass must cover every required criterion exactly once');
            assert(!submission.findings.some((finding) => finding.severity === 'critical' || finding.severity === 'major'), 'PASS_HAS_BLOCKING_FINDINGS', 'Pass cannot contain critical or major findings');
        }
        const report = {
            ...clone(submission),
            runId,
            status: 'current',
            createdAt: this.clock(),
        };
        this.append(run, 'dungeon/validation-submitted', { report }, actor.sessionId);
        return clone(report);
    }
    finishRun(actor, runId, resultSummary, workspaceFingerprint) {
        const run = this.requireTank(actor, runId);
        assert(run.phase === 'VALIDATING', 'INVALID_PHASE', 'Only a validating run can be completed');
        assert(run.controlState === 'normal', 'RUN_NOT_READY', 'Run control state must be normal');
        assert(typeof resultSummary === 'string' && resultSummary.trim(), 'SUMMARY_REQUIRED', 'A user-facing result summary is required');
        this.assertRequiredTasksComplete(run);
        assert(run.slots.tank.readiness === 'healthy' && run.slots.healer.readiness === 'healthy', 'MEMBER_NOT_READY', 'Tank and healer must be healthy before completion');
        assert(!Object.values(run.tasks).some((task) => task.progressState === 'stalled'), 'UNRESOLVED_STALL', 'Stalled tasks remain unresolved');
        assert(!run.resurrectionRequests.some((request) => request.status === 'issued' || request.status === 'consumed') &&
            !run.commanderRescueTickets.some((ticket) => ticket.status === 'issued' || ticket.status === 'consumed') &&
            !run.recoveryInstructions.some((instruction) => instruction.status === 'issued') &&
            !run.checkpointRequests.some((request) => request.status === 'issued'), 'RECOVERY_IN_PROGRESS', 'A recovery or resurrection is still active');
        const manifest = run.manifests.at(-1);
        const report = run.validationReports.at(-1);
        assert(manifest && report, 'VALIDATION_REQUIRED', 'A current pass report is required');
        assert(report.status === 'current' && report.verdict === 'pass', 'VALIDATION_REQUIRED', 'A current pass report is required');
        assert(report.taskSetVersion === run.taskSetVersion &&
            report.manifestVersion === manifest.manifestVersion &&
            report.workspaceFingerprint === workspaceFingerprint &&
            manifest.workspaceFingerprint === workspaceFingerprint, 'STALE_VALIDATION', 'Workspace or task set changed after validation');
        assert(!report.findings.some((finding) => finding.severity === 'critical' || finding.severity === 'major'), 'VALIDATION_REQUIRED', 'Blocking findings remain');
        this.append(run, 'dungeon/run-completion-prepared', {
            taskSetVersion: run.taskSetVersion,
            manifestVersion: manifest.manifestVersion,
            workspaceFingerprint,
        }, actor.sessionId);
        this.append(run, 'dungeon/run-completed', { resultSummary }, actor.sessionId);
        return clone(run);
    }
    async waitForChange(actor, runId, afterSequence, timeoutMs = 30_000, signal) {
        this.getRunForActor(actor, runId);
        assert(Number.isInteger(afterSequence) && afterSequence >= 0, 'INVALID_CURSOR', 'afterSequence must be a non-negative integer');
        assert(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120_000, 'INVALID_TIMEOUT', 'timeoutMs must be between 1 and 120000');
        const newerEvents = () => this.eventStore.load(runId).filter((event) => event.sequence > afterSequence);
        const immediate = newerEvents();
        if (immediate.length > 0) {
            return { run: this.getRunForActor(actor, runId), events: immediate, timedOut: false };
        }
        return await new Promise((resolve, reject) => {
            const listeners = this.waiters.get(runId) ?? new Set();
            this.waiters.set(runId, listeners);
            let settled = false;
            const cleanup = () => {
                listeners.delete(onChange);
                if (listeners.size === 0)
                    this.waiters.delete(runId);
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
            };
            const finish = (timedOut) => {
                if (settled)
                    return;
                const events = newerEvents();
                if (!timedOut && events.length === 0)
                    return;
                settled = true;
                cleanup();
                resolve({ run: this.getRunForActor(actor, runId), events, timedOut });
            };
            const onChange = () => finish(false);
            const onAbort = () => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                reject(signal?.reason ?? new Error('party_wait aborted'));
            };
            listeners.add(onChange);
            const timer = setTimeout(() => finish(true), timeoutMs);
            signal?.addEventListener('abort', onAbort, { once: true });
            if (signal?.aborted)
                onAbort();
            else
                onChange();
        });
    }
    sendPartyMessage(actor, runId, toSlot, input) {
        const run = this.requireRun(runId);
        const fromSlot = this.findSlot(run, actor.sessionId);
        assert(fromSlot, 'FORBIDDEN', 'Only current party members can send party messages');
        assert(run.slots[toSlot].currentSessionId, 'UNBOUND_SLOT', `Target slot ${toSlot} is not bound`);
        assert(typeof input.summary === 'string' && input.summary.trim(), 'INVALID_MESSAGE', 'Party message summary is required');
        if (input.kind === 'blocked' || input.kind === 'risk') {
            assert(input.evidence.length > 0, 'MISSING_EVIDENCE', `${input.kind} messages require evidence`);
        }
        const message = {
            messageId: this.idGenerator(),
            runId,
            fromSlot,
            toSlot,
            kind: input.kind,
            summary: input.summary,
            evidence: clone(input.evidence),
            createdAt: this.clock(),
        };
        this.append(run, 'dungeon/party-message-sent', { message }, actor.sessionId);
        return clone(message);
    }
    getFingerprintIgnoreScopes() {
        return clone(this.config.fingerprintIgnoreScopes);
    }
    getRun(runId) {
        return clone(this.requireRun(runId));
    }
    getRunForActor(actor, runId) {
        const run = this.requireRun(runId);
        assert(this.findSlot(run, actor.sessionId), 'FORBIDDEN', 'Only current party members can inspect the run');
        return clone(run);
    }
    append(run, type, payload, actorSessionId) {
        const event = {
            eventId: this.idGenerator(),
            runId: run.id,
            sequence: this.eventStore.load(run.id).length + 1,
            schemaVersion: 1,
            type,
            occurredAt: this.clock(),
            payload,
            ...(actorSessionId ? { actorSessionId } : {}),
        };
        const canonicalEvent = jsonClone(event);
        this.eventStore.append(canonicalEvent);
        const updated = this.reduce(this.runs.get(run.id), canonicalEvent);
        this.runs.set(run.id, updated);
        Object.assign(run, updated);
        this.eventStore.publishProjection?.(clone(updated));
        for (const notify of [...(this.waiters.get(run.id) ?? [])])
            notify();
    }
    reduce(current, event) {
        const payload = event.payload;
        if (event.type === 'dungeon/run-created') {
            const runId = event.runId;
            return {
                id: runId,
                objective: payload.objective,
                workspaceRoot: payload.workspaceRoot,
                workspaceFingerprint: payload.workspaceFingerprint,
                phase: 'FORMING',
                controlState: 'normal',
                scopeEnforcementMode: payload.scopeEnforcementMode,
                taskSetVersion: 0,
                slots: createEmptySlots(runId),
                tasks: {},
                manifests: [],
                validationReports: [],
                checkpointRequests: [],
                messages: [],
                healthSignals: [],
                recoveryInstructions: [],
                commanderLoad: 'normal',
                battleResChargesRemaining: payload.battleResCharges,
                commanderBattleResChargesRemaining: payload.commanderBattleResCharges,
                resurrectionRequests: [],
                commanderRescueTickets: [],
                createdAt: payload.createdAt,
                updatedAt: event.occurredAt,
            };
        }
        assert(current, 'CORRUPT_EVENT_LOG', 'The first event must create the run');
        const run = clone(current);
        run.updatedAt = event.occurredAt;
        switch (event.type) {
            case 'dungeon/member-bound': {
                const binding = run.slots[payload.slot];
                binding.currentSessionId = payload.sessionId;
                binding.generation = payload.generation;
                binding.lifeState = 'alive';
                binding.activityState = 'idle';
                binding.readiness = 'healthy';
                binding.history.push({
                    sessionId: payload.sessionId,
                    generation: payload.generation,
                    boundAt: payload.boundAt,
                });
                break;
            }
            case 'dungeon/phase-changed':
                run.phase = payload.phase;
                break;
            case 'dungeon/member-down': {
                const binding = run.slots[payload.slot];
                binding.lifeState = 'down';
                binding.activityState = 'stopped';
                if (payload.slot === 'tank') {
                    binding.readiness = 'unavailable';
                    run.commanderLoad = 'unavailable';
                    run.controlState = 'paused';
                }
                break;
            }
            case 'dungeon/resurrection-requested':
                run.resurrectionRequests.push(payload.request);
                run.battleResChargesRemaining -= 1;
                run.slots[payload.request.targetSlot].lifeState = 'resurrection-requested';
                break;
            case 'dungeon/resurrection-started': {
                const request = run.resurrectionRequests.find((item) => item.resurrectionId === payload.resurrectionId);
                request.status = 'consumed';
                run.slots[request.targetSlot].lifeState = 'resurrecting';
                break;
            }
            case 'dungeon/resurrection-completed': {
                const request = run.resurrectionRequests.find((item) => item.resurrectionId === payload.resurrectionId);
                request.status = 'completed';
                const binding = run.slots[request.targetSlot];
                binding.lifeState = 'alive';
                binding.activityState = 'idle';
                binding.readiness = 'healthy';
                break;
            }
            case 'dungeon/member-rebound': {
                const request = run.resurrectionRequests.find((item) => item.resurrectionId === payload.resurrectionId);
                request.status = 'completed';
                const binding = run.slots[payload.slot];
                const previous = binding.history.find((entry) => entry.sessionId === payload.previousSessionId && !entry.unboundAt);
                if (previous) {
                    previous.unboundAt = payload.completedAt;
                    previous.endReason = 'replaced-after-failure';
                }
                binding.currentSessionId = payload.sessionId;
                binding.generation = payload.generation;
                binding.lifeState = 'alive';
                binding.activityState = 'idle';
                binding.readiness = 'healthy';
                binding.history.push({
                    sessionId: payload.sessionId,
                    generation: payload.generation,
                    boundAt: payload.completedAt,
                });
                break;
            }
            case 'dungeon/resurrection-failed': {
                const request = run.resurrectionRequests.find((item) => item.resurrectionId === payload.resurrectionId);
                request.status = 'failed';
                run.slots[request.targetSlot].lifeState = 'down';
                if (!payload.chargeOnFailure)
                    run.battleResChargesRemaining += 1;
                break;
            }
            case 'dungeon/party-message-sent':
                run.messages.push(payload.message);
                break;
            case 'dungeon/member-health-signal-raised':
                run.healthSignals.push(payload.signal);
                break;
            case 'dungeon/member-readiness-changed':
                run.slots[payload.slot].readiness = payload.readiness;
                if (payload.readiness === 'unavailable' && payload.slot === 'tank') {
                    run.commanderLoad = 'unavailable';
                    run.controlState = 'paused';
                }
                break;
            case 'dungeon/member-recovery-directed':
                run.recoveryInstructions.push(payload.instruction);
                run.slots.healer.readiness = 'recovering';
                break;
            case 'dungeon/member-recovery-completed': {
                const instruction = run.recoveryInstructions.find((item) => item.instructionId === payload.instructionId);
                instruction.status = 'completed';
                instruction.completedAt = payload.completedAt;
                run.slots.healer.readiness = 'healthy';
                break;
            }
            case 'dungeon/member-recovery-failed': {
                const instruction = run.recoveryInstructions.find((item) => item.instructionId === payload.instructionId);
                instruction.status = 'failed';
                instruction.completedAt = payload.completedAt;
                run.slots.healer.readiness = 'unavailable';
                run.controlState = 'paused';
                break;
            }
            case 'dungeon/task-created':
                run.tasks[payload.workOrder.id] = {
                    workOrder: payload.workOrder,
                    status: 'pending',
                    repairRound: 0,
                    executionReports: [],
                };
                run.taskSetVersion = payload.taskSetVersion;
                this.staleReports(run);
                break;
            case 'dungeon/task-assigned': {
                const task = run.tasks[payload.taskId];
                task.ownerSlot = payload.ownerSlot;
                task.status = 'ready';
                break;
            }
            case 'dungeon/task-lease-granted': {
                const task = run.tasks[payload.taskId];
                task.activeLease = payload.lease;
                task.status = 'running';
                task.progressState = 'on-track';
                task.missedCheckpoints = 0;
                task.nextCheckpointDueAt = payload.nextCheckpointDueAt;
                run.slots[payload.lease.ownerSlot].activityState = 'running';
                break;
            }
            case 'dungeon/task-submitted': {
                const report = payload.report;
                const task = run.tasks[report.taskId];
                task.executionReports.push(report);
                task.status = report.status;
                const checkpointRequest = run.checkpointRequests.find((request) => request.taskId === report.taskId &&
                    request.leaseId === report.leaseId &&
                    request.leaseVersion === report.leaseVersion &&
                    request.status === 'issued');
                if (checkpointRequest) {
                    checkpointRequest.status = 'completed';
                    checkpointRequest.completedAt = event.occurredAt;
                }
                delete task.activeLease;
                break;
            }
            case 'dungeon/task-turn-registered':
                run.tasks[payload.taskId].currentTurnId = payload.turnId;
                break;
            case 'dungeon/task-interrupt-requested':
                run.tasks[payload.taskId].interruptState = 'requested';
                break;
            case 'dungeon/task-interrupt-completed': {
                const task = run.tasks[payload.taskId];
                task.interruptState = 'completed';
                task.quarantinedFiles = payload.quarantinedFiles;
                task.quarantineReviewed = payload.quarantinedFiles.length === 0;
                break;
            }
            case 'dungeon/task-interrupt-failed':
                run.tasks[payload.taskId].interruptState = 'failed';
                break;
            case 'dungeon/task-lease-revoked': {
                const task = run.tasks[payload.taskId];
                delete task.activeLease;
                task.status = 'ready';
                break;
            }
            case 'dungeon/workspace-changes-quarantined': {
                const task = run.tasks[payload.taskId];
                task.quarantinedFiles = payload.files;
                task.quarantineReviewed = false;
                break;
            }
            case 'dungeon/workspace-quarantine-reviewed':
                run.tasks[payload.taskId].quarantineReviewed = true;
                break;
            case 'dungeon/task-owner-reassigned': {
                const task = run.tasks[payload.taskId];
                task.ownerSlot = payload.ownerSlot;
                task.status = 'ready';
                task.progressState = 'on-track';
                task.missedCheckpoints = 0;
                delete task.currentTurnId;
                break;
            }
            case 'dungeon/task-stall-suspected':
            case 'dungeon/task-stall-confirmed': {
                const task = run.tasks[payload.taskId];
                task.progressState = payload.progressState;
                task.missedCheckpoints = payload.missedCheckpoints;
                task.nextCheckpointDueAt = payload.nextCheckpointDueAt;
                break;
            }
            case 'dungeon/checkpoint-requested':
                run.checkpointRequests.push(payload.request);
                break;
            case 'dungeon/checkpoint-request-expired': {
                const request = run.checkpointRequests.find((item) => item.requestId === payload.requestId);
                if (request)
                    request.status = 'expired';
                break;
            }
            case 'dungeon/checkpoint-submitted': {
                const checkpoint = payload.checkpoint;
                const task = run.tasks[checkpoint.taskId];
                task.lastCheckpoint = checkpoint;
                task.activeLease = payload.renewedLease;
                task.progressState = 'on-track';
                task.missedCheckpoints = 0;
                task.nextCheckpointDueAt = payload.nextCheckpointDueAt;
                const request = run.checkpointRequests.find((item) => item.taskId === checkpoint.taskId &&
                    item.leaseId === checkpoint.leaseId &&
                    item.leaseVersion === checkpoint.leaseVersion &&
                    item.status === 'issued');
                if (request) {
                    request.status = 'completed';
                    request.completedAt = checkpoint.observedAt ?? event.occurredAt;
                }
                break;
            }
            case 'dungeon/task-reopened': {
                const task = run.tasks[payload.taskId];
                task.workOrder.version = payload.taskVersion;
                task.repairRound = payload.repairRound;
                task.status = 'pending';
                delete task.activeLease;
                delete task.ownerSlot;
                run.taskSetVersion = payload.taskSetVersion;
                this.staleReports(run);
                break;
            }
            case 'dungeon/workspace-fingerprint-observed':
                run.workspaceFingerprint = payload.workspaceFingerprint;
                this.staleReports(run);
                break;
            case 'dungeon/commander-load-changed':
                run.commanderLoad = payload.commanderLoad;
                break;
            case 'dungeon/dispatch-throttled':
                run.controlState = 'throttled';
                break;
            case 'dungeon/dispatch-paused':
                run.controlState = 'paused';
                break;
            case 'dungeon/commander-returned': {
                const ticket = payload.ticketId
                    ? run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId)
                    : undefined;
                if (ticket)
                    ticket.status = 'completed';
                if (payload.refundCharge)
                    run.commanderBattleResChargesRemaining += 1;
                run.controlState = 'normal';
                run.commanderLoad = 'normal';
                run.slots.tank.lifeState = 'alive';
                run.slots.tank.readiness = 'healthy';
                break;
            }
            case 'dungeon/dispatch-resumed':
                run.controlState = 'normal';
                run.commanderLoad = 'normal';
                run.slots.tank.lifeState = 'alive';
                run.slots.tank.readiness = 'healthy';
                break;
            case 'dungeon/commander-checkpointed':
                run.commanderCheckpoint = payload.checkpoint;
                break;
            case 'dungeon/commander-rescue-ticket-issued':
                run.commanderRescueTickets.push(payload.ticket);
                run.commanderBattleResChargesRemaining -= 1;
                break;
            case 'dungeon/commander-rescue-ticket-consumed': {
                const ticket = run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId);
                ticket.status = 'consumed';
                ticket.recoveryExpiresAt = payload.recoveryExpiresAt;
                run.controlState = 'recovering';
                break;
            }
            case 'dungeon/commander-rescue-ticket-expired': {
                const ticket = run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId);
                ticket.status = 'expired';
                run.commanderBattleResChargesRemaining += 1;
                break;
            }
            case 'dungeon/commander-resurrection-completed': {
                const ticket = run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId);
                ticket.status = 'completed';
                run.slots.tank.lifeState = 'alive';
                run.slots.tank.readiness = 'recovering';
                run.commanderLoad = 'pressured';
                run.controlState = 'recovering';
                break;
            }
            case 'dungeon/commander-resurrection-failed': {
                const ticket = run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId);
                ticket.status = 'failed';
                run.controlState = 'paused';
                break;
            }
            case 'dungeon/validation-manifest-created':
                run.manifests.push(payload.manifest);
                run.workspaceFingerprint = payload.manifest.workspaceFingerprint;
                this.staleReports(run);
                break;
            case 'dungeon/validation-submitted':
                this.staleReports(run);
                run.validationReports.push(payload.report);
                break;
            case 'dungeon/run-completed':
                run.phase = 'COMPLETED';
                run.resultSummary = payload.resultSummary;
                break;
            case 'dungeon/run-failed':
                run.phase = 'FAILED';
                break;
        }
        return run;
    }
    buildCommanderCheckpoint(run, pendingDecisionIds) {
        return {
            checkpointId: this.idGenerator(),
            runId: run.id,
            phase: run.phase,
            controlState: run.controlState,
            taskSetVersion: run.taskSetVersion,
            pendingDecisionIds: clone(pendingDecisionIds),
            activeLeaseIds: Object.values(run.tasks).flatMap((task) => task.activeLease ? [task.activeLease.leaseId] : []),
            memberReadiness: Object.fromEntries(slots.flatMap((slot) => run.slots[slot].readiness ? [[slot, run.slots[slot].readiness]] : [])),
            workspaceFingerprint: run.workspaceFingerprint,
            createdAt: this.clock(),
        };
    }
    staleReports(run) {
        for (const report of run.validationReports)
            report.status = 'stale';
    }
    requireRun(runId) {
        const existing = this.runs.get(runId);
        if (existing)
            return existing;
        const events = this.eventStore.load(runId);
        assert(events.length > 0, 'RUN_NOT_FOUND', `Run ${runId} was not found`);
        this.recoverRun(runId);
        return this.runs.get(runId);
    }
    requireTank(actor, runId) {
        const run = this.requireRun(runId);
        assert(run.slots.tank.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound tank can perform this operation');
        return run;
    }
    requireDps(run, sessionId) {
        const slot = this.findSlot(run, sessionId);
        assert(slot && dpsSlots.includes(slot), 'FORBIDDEN', 'Only a bound DPS can perform this operation');
        return slot;
    }
    findSlot(run, sessionId) {
        return slots.find((slot) => run.slots[slot].currentSessionId === sessionId);
    }
    requireTask(run, taskId) {
        const task = run.tasks[taskId];
        assert(task, 'TASK_NOT_FOUND', `Task ${taskId} was not found`);
        return task;
    }
    assertMutable(run) {
        assert(!terminalPhases.includes(run.phase), 'RUN_TERMINAL', `Run is already ${run.phase}`);
    }
    assertRequiredTasksComplete(run) {
        const incomplete = Object.values(run.tasks).filter((task) => task.workOrder.required && task.status !== 'completed');
        assert(incomplete.length === 0, 'INCOMPLETE_TASKS', `Required tasks are incomplete: ${incomplete.map((task) => task.workOrder.id).join(', ')}`);
    }
}
