import { matchesGlob, relative, resolve } from 'node:path';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { DungeonError, } from '../service/dungeon-service.js';
import { createWorkspaceSnapshot, diffWorkspaceSnapshots, } from './workspace-fingerprint.js';
const roleTools = {
    'dps-1': ['party_status', 'party_wait', 'party_health', 'work_claim', 'work_submit', 'member_checkpoint', 'party_message', 'read', 'write', 'edit', 'glob', 'grep', 'bash'],
    'dps-2': ['party_status', 'party_wait', 'party_health', 'work_claim', 'work_submit', 'member_checkpoint', 'party_message', 'read', 'write', 'edit', 'glob', 'grep', 'bash'],
    'dps-3': ['party_status', 'party_wait', 'party_health', 'work_claim', 'work_submit', 'member_checkpoint', 'party_message', 'read', 'write', 'edit', 'glob', 'grep', 'bash'],
    healer: ['party_status', 'party_wait', 'party_health', 'validation_manifest', 'validation_submit', 'member_self_maintain', 'battle_res', 'party_message', 'read', 'glob', 'grep'],
};
const rolePersonas = {
    'dps-1': 'You are Pyra the Flameblade, the party’s Flame Engineer Executor (DPS-1). Execute only your structured work order and active lease. Re-read files before editing, stay inside writeScopes, submit evidence and checkpoints, and never claim the whole run is complete.',
    'dps-2': 'You are Nyx the Shadowstrider, the party’s Shadow Scout Executor (DPS-2). Execute only your structured work order and active lease. Re-read files before editing, stay inside writeScopes, submit evidence and checkpoints, and never claim the whole run is complete.',
    'dps-3': 'You are Aster the Starweaver, the party’s Arcane Architect Executor (DPS-3). Execute only your structured work order and active lease. Re-read files before editing, stay inside writeScopes, submit evidence and checkpoints, and never claim the whole run is complete.',
    healer: 'You are Lumina the Oracle, the independent Holy Adjudicator Validator (Healer). Inspect the current manifest and evidence, submit a complete validation report, and perform only authorized maintenance or resurrection. Do not modify implementation files or impersonate the Commander.',
};
export class PartyAgentManager {
    service;
    agents;
    presets;
    handles = new Map();
    commanderHandles = new Map();
    dispatchedRecoveryIds = new Set();
    leaseAudits = new Map();
    pending = new Map();
    constructor(service, agents, presets) {
        this.service = service;
        this.agents = agents;
        this.presets = presets;
    }
    async prepareForPhase(actor, runId, phase) {
        if (phase === 'EXECUTING') {
            await this.ensureMember(actor, runId, 'healer');
            return;
        }
        if (phase !== 'VALIDATING')
            return;
        await this.ensureMember(actor, runId, 'healer');
        const handle = this.handles.get(keyFor(runId, 'healer'));
        if (!handle)
            throw new DungeonError('HEALER_AGENT_UNAVAILABLE', 'The healer Agent is not live');
        handle.agent.send(createUserMessage({
            content: [{
                    type: 'text',
                    text: `Run ${runId} entered validation. Call validation_manifest to obtain the host-fingerprinted immutable criteria, inspect evidence independently, then submit one complete validation_submit report.`,
                }],
            source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
        }), 'next-turn', true);
    }
    async kickScheduler(runId) {
        const run = this.service.getRun(runId);
        const tankSessionId = run.slots.tank.currentSessionId;
        if (!tankSessionId)
            return [];
        try {
            return await this.dispatchAvailableTasks({ sessionId: tankSessionId }, runId);
        }
        catch {
            // Scheduling is best-effort after a committed state transition. A later
            // status/phase/task event can safely kick it again without duplicating work.
            return [];
        }
    }
    async dispatchAvailableTasks(actor, runId) {
        const assigned = [];
        const run = this.service.getRunForActor(actor, runId);
        if (run.phase !== 'EXECUTING' && run.phase !== 'REPAIR')
            return assigned;
        const busySlots = new Set(Object.values(run.tasks)
            .filter((task) => task.status === 'running' && task.ownerSlot)
            .map((task) => task.ownerSlot));
        const freeSlots = ['dps-1', 'dps-2', 'dps-3'].filter((slot) => !busySlots.has(slot));
        const priority = { critical: 0, high: 1, normal: 2, low: 3 };
        const readyTasks = Object.values(run.tasks)
            .filter((task) => ['pending', 'ready'].includes(task.status) && !task.ownerSlot)
            .sort((left, right) => priority[left.workOrder.priority] - priority[right.workOrder.priority]);
        for (const task of readyTasks) {
            const slot = freeSlots.shift();
            if (!slot)
                break;
            try {
                this.service.preflightTaskAssignment(actor, runId, task.workOrder.id, slot);
                await this.ensureMember(actor, runId, slot);
                this.service.assignTask(actor, runId, task.workOrder.id, slot);
                this.dispatchTask(actor, runId, task.workOrder.id);
                assigned.push(task.workOrder.id);
            }
            catch (error) {
                if (error instanceof DungeonError && ['SCOPE_OVERLAP', 'MAX_CONCURRENCY', 'TASK_NOT_READY', 'TASK_NOT_ASSIGNABLE', 'UNMET_DEPENDENCY'].includes(error.code)) {
                    freeSlots.unshift(slot);
                    continue;
                }
                throw error;
            }
        }
        return assigned;
    }
    async executeValidatorMaintenance(actor, runId) {
        const instruction = this.service.directValidatorMaintenance(actor, runId);
        const run = this.service.getRun(runId);
        const healerSessionId = run.slots.healer.currentSessionId;
        const healer = this.handles.get(keyFor(runId, 'healer'))?.agent ??
            this.agents.get(healerSessionId);
        if (!healer) {
            this.service.completeValidatorMaintenance({ sessionId: healerSessionId }, runId, instruction.instructionId, false);
            throw new DungeonError('HEALER_AGENT_UNAVAILABLE', 'The healer Agent is not live');
        }
        try {
            healer.cancel({ kind: 'hook', reason: 'dungeon-party validator self-maintenance' }, { keepInbox: true });
            await healer.whenIdle();
        }
        catch (error) {
            this.service.completeValidatorMaintenance({ sessionId: healerSessionId }, runId, instruction.instructionId, false);
            throw error;
        }
        healer.send(createUserMessage({
            content: [{
                    type: 'text',
                    text: `Validator maintenance was authorized by the tank. Stabilize this original Session, then call member_self_maintain with the result:\n${JSON.stringify(instruction, null, 2)}`,
                }],
            source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
        }), 'next-turn', true);
    }
    dispatchBattleRes(actor, runId, resurrectionId) {
        const run = this.service.getRunForActor(actor, runId);
        if (run.slots.tank.currentSessionId !== actor.sessionId) {
            throw new DungeonError('FORBIDDEN', 'Only the bound tank can dispatch DPS resurrection');
        }
        const request = run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId);
        if (request?.status !== 'issued')
            throw new DungeonError('RESURRECTION_NOT_ACTIVE', 'DPS resurrection is not issued');
        this.dispatchRecoveryToHealer(runId, resurrectionId, {
            kind: 'dps-resurrection',
            request,
            instructions: ['Call battle_res start-dps, inspect the target state, then complete-dps with resume or replace mode.'],
        });
    }
    dispatchCommanderRescue(runId, ticketId) {
        const run = this.service.getRun(runId);
        const ticket = run.commanderRescueTickets.find((item) => item.ticketId === ticketId);
        if (ticket?.status !== 'issued')
            throw new DungeonError('TICKET_NOT_ACTIVE', 'Commander rescue ticket is not issued');
        this.dispatchRecoveryToHealer(runId, ticketId, {
            kind: 'commander-resurrection',
            ticket,
            checkpoint: run.commanderCheckpoint,
            instructions: ['Call battle_res consume-commander, then complete-commander to restore only the original Lead Session.'],
        });
    }
    async ensureMember(actor, runId, slot) {
        const run = this.service.getRunForActor(actor, runId);
        if (run.slots.tank.currentSessionId !== actor.sessionId) {
            throw new DungeonError('FORBIDDEN', 'Only the bound tank can create party members');
        }
        const existing = run.slots[slot].currentSessionId;
        const key = keyFor(runId, slot);
        if (existing && this.handles.has(key))
            return existing;
        const inFlight = this.pending.get(key);
        if (inFlight)
            return inFlight;
        const creation = existing
            ? this.restoreMember(actor, runId, slot, existing)
            : this.createMember(actor, runId, slot);
        this.pending.set(key, creation);
        try {
            return await creation;
        }
        finally {
            this.pending.delete(key);
        }
    }
    async recoverCommander(actor, runId, ticketId) {
        const run = this.service.getRunForActor(actor, runId);
        const ticket = run.commanderRescueTickets.find((item) => item.ticketId === ticketId);
        if (ticket?.status !== 'consumed') {
            throw new DungeonError('TICKET_NOT_ACTIVE', 'Commander rescue ticket is not active');
        }
        let commander = this.agents.get(ticket.targetSessionId);
        let resumedHandle;
        try {
            if (commander) {
                commander.cancel({ kind: 'hook', reason: 'dungeon-party commander recovery' }, { keepInbox: true });
                await commander.whenIdle();
            }
            else {
                resumedHandle = await this.agents.resume({
                    resumeSessionId: ticket.targetSessionId,
                    setup: async (agentCtx) => {
                        await this.presets.mount(agentCtx, 'dungeon-party');
                    },
                });
                commander = resumedHandle.agent;
            }
            this.service.completeCommanderResurrection(actor, runId, ticketId, {
                success: true,
                sessionId: String(commander.id),
            });
        }
        catch (error) {
            if (resumedHandle)
                await resumedHandle.dispose();
            this.service.completeCommanderResurrection(actor, runId, ticketId, {
                success: false,
                sessionId: ticket.targetSessionId,
            });
            throw error;
        }
        if (resumedHandle)
            this.commanderHandles.set(runId, resumedHandle);
        const recovered = this.service.getRun(runId);
        commander.send(createUserMessage({
            content: [{
                    type: 'text',
                    text: `Commander recovery completed. Review this checkpoint and call party_resume_dispatch only after reconciliation:\n${JSON.stringify(recovered.commanderCheckpoint, null, 2)}`,
                }],
            source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
        }), 'next-turn', true);
    }
    async completeDpsResurrection(actor, runId, resurrectionId, mode) {
        const run = this.service.getRunForActor(actor, runId);
        const request = run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId);
        if (request?.status !== 'consumed') {
            throw new DungeonError('RESURRECTION_NOT_ACTIVE', 'DPS resurrection is not active');
        }
        const key = keyFor(runId, request.targetSlot);
        const previousHandle = this.handles.get(key);
        if (mode === 'resume') {
            let handle = previousHandle;
            let restored = false;
            if (!handle) {
                const live = this.agents.get(request.targetSessionId);
                if (live) {
                    handle = { agent: live, dispose: async () => undefined };
                }
                else {
                    const tankSessionId = run.slots.tank.currentSessionId;
                    if (!tankSessionId)
                        throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The run has no bound tank');
                    const tankAgent = this.agents.get(tankSessionId);
                    if (!tankAgent)
                        throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The bound tank Agent is not live');
                    handle = await tankAgent.ctx.agents.resume({
                        resumeSessionId: request.targetSessionId,
                        setup: async (agentCtx) => {
                            this.presets.composeFrom(agentCtx, tankAgent.ctx);
                            agentCtx.tools.restrict({ allow: roleTools[request.targetSlot] });
                            agentCtx.systemPrompt.section({
                                name: 'deployment:persona', order: 0, text: rolePersonas[request.targetSlot],
                            });
                            this.installExecutionGuard(agentCtx, runId, request.targetSlot);
                        },
                    });
                    restored = true;
                }
                this.handles.set(key, handle);
            }
            try {
                if (!restored) {
                    handle.agent.cancel({ kind: 'hook', reason: 'dungeon-party battle resurrection resume' }, { keepInbox: true });
                    await handle.agent.whenIdle();
                }
            }
            catch (error) {
                if (restored) {
                    this.handles.delete(key);
                    await handle.dispose();
                }
                this.service.completeBattleRes(actor, runId, resurrectionId, {
                    success: false,
                    mode,
                    sessionId: request.targetSessionId,
                });
                throw error;
            }
            const sessionId = String(handle.agent.id);
            this.service.completeBattleRes(actor, runId, resurrectionId, { success: true, mode, sessionId });
            handle.agent.send(createUserMessage({
                content: [{
                        type: 'text',
                        text: `Resurrection packet for run ${runId}. Review assigned work and durable checkpoints, then call work_claim before resuming changes:\n${JSON.stringify(Object.values(run.tasks).filter((task) => task.ownerSlot === request.targetSlot).map((task) => ({ workOrder: task.workOrder, lastCheckpoint: task.lastCheckpoint })), null, 2)}`,
                    }],
                source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
            }), 'next-turn', true);
            return sessionId;
        }
        const tankSessionId = run.slots.tank.currentSessionId;
        if (!tankSessionId)
            throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The run has no bound tank');
        const tankAgent = this.agents.get(tankSessionId);
        if (!tankAgent)
            throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The bound tank Agent is not live');
        const generation = run.slots[request.targetSlot].generation + 1;
        const sessionId = `${runId}-${request.targetSlot}-g${generation}`;
        const handle = await tankAgent.ctx.agents.create({
            sessionId: sessionId,
            meta: {
                cwd: run.workspaceRoot,
                parentSession: tankSessionId,
                origin: 'subagent',
                delegationDepth: 1,
                agentPreset: 'dungeon-party',
            },
            setup: async (agentCtx) => {
                this.presets.composeFrom(agentCtx, tankAgent.ctx);
                agentCtx.tools.restrict({ allow: roleTools[request.targetSlot] });
                agentCtx.systemPrompt.section({
                    name: 'deployment:persona',
                    order: 0,
                    text: rolePersonas[request.targetSlot],
                });
                this.installExecutionGuard(agentCtx, runId, request.targetSlot);
            },
        });
        try {
            this.service.completeBattleRes(actor, runId, resurrectionId, {
                success: true,
                mode: 'replace',
                sessionId: String(handle.agent.id),
            });
        }
        catch (error) {
            await handle.dispose();
            throw error;
        }
        this.handles.set(key, handle);
        if (previousHandle)
            await previousHandle.dispose();
        return String(handle.agent.id);
    }
    requestCheckpoint(actor, runId, taskId) {
        const request = this.service.requestTaskCheckpoint(actor, runId, taskId);
        const handle = this.handles.get(keyFor(runId, request.slot));
        if (!handle)
            throw new DungeonError('DPS_AGENT_UNAVAILABLE', `Agent for ${request.slot} is not live`);
        handle.agent.send(createUserMessage({
            content: [{
                    type: 'text',
                    text: `Checkpoint requested for task ${taskId}. Respond with member_checkpoint before ${request.dueAt}. Request:\n${JSON.stringify(request, null, 2)}`,
                }],
            source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
        }), 'next-step', true);
    }
    beginLeaseAudit(actor, runId, taskId, leaseId) {
        const run = this.service.getRunForActor(actor, runId);
        const task = run.tasks[taskId];
        if (task?.activeLease?.leaseId !== leaseId)
            throw new DungeonError('STALE_LEASE', 'Cannot audit a stale lease');
        this.leaseAudits.set(`${runId}:${taskId}`, {
            leaseId,
            snapshot: createWorkspaceSnapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes()),
        });
    }
    auditWorkspaceBeforeSubmit(actor, runId, report) {
        const run = this.service.getRunForActor(actor, runId);
        const audit = this.leaseAudits.get(`${runId}:${report.taskId}`);
        if (!audit || audit.leaseId !== report.leaseId) {
            throw new DungeonError('WORKSPACE_AUDIT_MISSING', 'The active lease has no host workspace baseline');
        }
        const current = createWorkspaceSnapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes());
        const changedFiles = diffWorkspaceSnapshots(audit.snapshot, current);
        const activeScopes = Object.values(run.tasks).flatMap((task) => task.activeLease ? task.workOrder.writeScopes : []);
        const outsideActiveScopes = changedFiles.filter((path) => !activeScopes.some((scope) => path === scope || matchesGlob(path, scope)));
        if (outsideActiveScopes.length > 0) {
            throw new DungeonError('ACTUAL_WRITE_SCOPE_VIOLATION', `Host-observed workspace changes are outside active scopes: ${outsideActiveScopes.join(', ')}`);
        }
        if (run.scopeEnforcementMode === 'serial') {
            const reported = [...new Set(report.changedFiles)].sort();
            const actual = changedFiles.filter((path) => run.tasks[report.taskId].workOrder.writeScopes.some((scope) => path === scope || matchesGlob(path, scope)));
            if (JSON.stringify(reported) !== JSON.stringify(actual)) {
                throw new DungeonError('CHANGED_FILES_MISMATCH', 'Reported changedFiles do not match the host-observed serial workspace delta');
            }
        }
    }
    completeLeaseAudit(runId, taskId) {
        this.leaseAudits.delete(`${runId}:${taskId}`);
    }
    async interruptTask(actor, runId, taskId, turnId) {
        const task = this.service.requestTaskInterrupt(actor, runId, taskId, turnId);
        if (!task.ownerSlot)
            throw new DungeonError('TASK_NOT_ASSIGNED', `Task ${taskId} has no DPS owner`);
        const handle = this.handles.get(keyFor(runId, task.ownerSlot));
        if (!handle)
            throw new DungeonError('DPS_AGENT_UNAVAILABLE', `Agent for ${task.ownerSlot} is not live`);
        try {
            handle.agent.cancel({ kind: 'hook', reason: `dungeon-party interrupt task ${taskId} turn ${turnId}` }, { keepInbox: true });
            await handle.agent.whenIdle();
        }
        catch (error) {
            this.service.completeTaskInterrupt(runId, taskId, turnId, {
                success: false,
                quarantinedFiles: [],
            });
            throw error;
        }
        const audit = this.leaseAudits.get(`${runId}:${taskId}`);
        const run = this.service.getRun(runId);
        const quarantinedFiles = audit
            ? diffWorkspaceSnapshots(audit.snapshot, createWorkspaceSnapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes()))
            : [];
        this.leaseAudits.delete(`${runId}:${taskId}`);
        this.service.completeTaskInterrupt(runId, taskId, turnId, {
            success: true,
            quarantinedFiles,
        });
    }
    sendPartyMessage(actor, runId, toSlot, input) {
        const run = this.service.getRunForActor(actor, runId);
        const targetSessionId = run.slots[toSlot].currentSessionId;
        if (!targetSessionId)
            throw new DungeonError('UNBOUND_SLOT', `Target slot ${toSlot} is not bound`);
        const target = toSlot === 'tank'
            ? this.agents.get(targetSessionId)
            : this.handles.get(keyFor(runId, toSlot))?.agent;
        if (!target)
            throw new DungeonError('TARGET_AGENT_UNAVAILABLE', `Agent for ${toSlot} is not live`);
        const message = this.service.sendPartyMessage(actor, runId, toSlot, input);
        target.send(createUserMessage({
            content: [{ type: 'text', text: `Dungeon-party message:\n${JSON.stringify(message, null, 2)}` }],
            source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
        }), 'next-step', true);
    }
    dispatchTask(actor, runId, taskId) {
        const run = this.service.getRunForActor(actor, runId);
        if (run.slots.tank.currentSessionId !== actor.sessionId) {
            throw new DungeonError('FORBIDDEN', 'Only the bound tank can dispatch work orders');
        }
        const task = run.tasks[taskId];
        if (!task?.ownerSlot)
            throw new DungeonError('TASK_NOT_ASSIGNED', `Task ${taskId} is not assigned`);
        const handle = this.handles.get(keyFor(runId, task.ownerSlot));
        if (!handle)
            throw new DungeonError('DPS_AGENT_UNAVAILABLE', `Agent for ${task.ownerSlot} is not live`);
        const payload = {
            runId,
            slot: task.ownerSlot,
            generation: run.slots[task.ownerSlot].generation,
            workOrder: task.workOrder,
            instructions: [
                'Call work_claim before modifying files.',
                'Stay within writeScopes and submit checkpoints with evidence.',
                'Finish with work_submit; do not announce the entire run complete.',
            ],
        };
        handle.agent.send(createUserMessage({
            content: [{ type: 'text', text: `Assigned dungeon-party work order:\n${JSON.stringify(payload, null, 2)}` }],
            source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
        }), 'next-turn', true);
    }
    forgetDisposedAgent(sessionId) {
        for (const [key, handle] of this.handles) {
            if (String(handle.agent.id) === sessionId)
                this.handles.delete(key);
        }
        for (const [runId, handle] of this.commanderHandles) {
            if (String(handle.agent.id) === sessionId)
                this.commanderHandles.delete(runId);
        }
    }
    async disposeRun(runId) {
        const prefix = `${runId}:`;
        const handles = [];
        for (const [key, handle] of this.handles) {
            if (!key.startsWith(prefix))
                continue;
            this.handles.delete(key);
            handles.push(handle);
        }
        for (const key of this.leaseAudits.keys()) {
            if (key.startsWith(prefix))
                this.leaseAudits.delete(key);
        }
        const commanderHandle = this.commanderHandles.get(runId);
        if (commanderHandle) {
            this.commanderHandles.delete(runId);
            handles.push(commanderHandle);
        }
        await Promise.all(handles.map((handle) => handle.dispose()));
    }
    async dispose() {
        const handles = [...this.handles.values(), ...this.commanderHandles.values()];
        this.handles.clear();
        this.commanderHandles.clear();
        this.leaseAudits.clear();
        await Promise.all(handles.map((handle) => handle.dispose()));
    }
    installExecutionGuard(agentCtx, runId, slot) {
        if (slot === 'healer')
            return;
        agentCtx.on('tools/pre-execute', async (exec, next) => {
            if (exec.name !== 'write' && exec.name !== 'edit' && exec.name !== 'bash')
                return next();
            const run = this.service.getRun(runId);
            const task = Object.values(run.tasks).find((candidate) => candidate.ownerSlot === slot && candidate.status === 'running' && candidate.activeLease);
            if (!task)
                return { kind: 'deny', reason: 'DPS write/command tools require an active dungeon task lease.' };
            const args = exec.arguments;
            if (exec.name === 'write' || exec.name === 'edit') {
                const suppliedPath = args.file_path ?? args.path;
                if (typeof suppliedPath !== 'string')
                    return { kind: 'deny', reason: 'File mutation requires a concrete file path.' };
                const root = resolve(run.workspaceRoot);
                const absolutePath = resolve(root, suppliedPath);
                const workspacePath = relative(root, absolutePath).replaceAll('\\', '/');
                const allowed = workspacePath && !workspacePath.startsWith('../') &&
                    task.workOrder.writeScopes.some((scope) => workspacePath === scope || matchesGlob(workspacePath, scope));
                if (!allowed)
                    return { kind: 'deny', reason: `Path ${suppliedPath} is outside the active task writeScopes.` };
            }
            else {
                const command = typeof args.command === 'string' ? args.command.trim().replace(/\s+/g, ' ') : '';
                const isGlobal = /^(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall|update|upgrade)\b/i.test(command) ||
                    /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:format|fmt|codegen|generate|migrate)\b/i.test(command) ||
                    /\b(?:prisma|drizzle|typeorm)\s+(?:generate|migrate)\b/i.test(command);
                const owned = (task.workOrder.globalCommands ?? []).some((item) => item.trim().replace(/\s+/g, ' ') === command);
                if (isGlobal && !owned)
                    return { kind: 'deny', reason: `Workspace-global command ${command} is not owned by the active task.` };
            }
            return next();
        });
    }
    dispatchRecoveryToHealer(runId, recoveryId, payload) {
        if (this.dispatchedRecoveryIds.has(recoveryId))
            return;
        const run = this.service.getRun(runId);
        const healerSessionId = run.slots.healer.currentSessionId;
        const healer = this.handles.get(keyFor(runId, 'healer'))?.agent ??
            (healerSessionId ? this.agents.get(healerSessionId) : undefined);
        if (!healer)
            throw new DungeonError('HEALER_AGENT_UNAVAILABLE', 'The healer Agent is not live');
        healer.send(createUserMessage({
            content: [{ type: 'text', text: `Authorized dungeon-party recovery:\n${JSON.stringify(payload, null, 2)}` }],
            source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
        }), 'next-turn', true);
        this.dispatchedRecoveryIds.add(recoveryId);
    }
    async restoreMember(actor, runId, slot, sessionId) {
        const key = keyFor(runId, slot);
        const live = this.agents.get(sessionId);
        if (live) {
            this.handles.set(key, { agent: live, dispose: async () => undefined });
            return sessionId;
        }
        const tankAgent = this.agents.get(actor.sessionId);
        if (!tankAgent)
            throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The bound tank Agent is not live');
        const handle = await tankAgent.ctx.agents.resume({
            resumeSessionId: sessionId,
            setup: async (agentCtx) => {
                this.presets.composeFrom(agentCtx, tankAgent.ctx);
                agentCtx.tools.restrict({ allow: roleTools[slot] });
                agentCtx.systemPrompt.section({
                    name: 'deployment:persona',
                    order: 0,
                    text: rolePersonas[slot],
                });
                this.installExecutionGuard(agentCtx, runId, slot);
            },
        });
        this.handles.set(key, handle);
        return String(handle.agent.id);
    }
    async createMember(actor, runId, slot) {
        const run = this.service.getRunForActor(actor, runId);
        const tankAgent = this.agents.get(actor.sessionId);
        if (!tankAgent)
            throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The bound tank Agent is not live');
        const generation = run.slots[slot].generation + 1;
        const sessionId = `${runId}-${slot}-g${generation}`;
        const handle = await tankAgent.ctx.agents.create({
            sessionId: sessionId,
            meta: {
                cwd: run.workspaceRoot,
                parentSession: actor.sessionId,
                origin: 'subagent',
                delegationDepth: 1,
                agentPreset: 'dungeon-party',
            },
            setup: async (agentCtx) => {
                this.presets.composeFrom(agentCtx, tankAgent.ctx);
                agentCtx.tools.restrict({ allow: roleTools[slot] });
                agentCtx.systemPrompt.section({
                    name: 'deployment:persona',
                    order: 0,
                    text: rolePersonas[slot],
                });
                this.installExecutionGuard(agentCtx, runId, slot);
            },
        });
        try {
            this.service.bindMember(actor, runId, slot, String(handle.agent.id));
            this.handles.set(keyFor(runId, slot), handle);
            return String(handle.agent.id);
        }
        catch (error) {
            await handle.dispose();
            throw error;
        }
    }
}
function keyFor(runId, slot) {
    return `${runId}:${slot}`;
}
