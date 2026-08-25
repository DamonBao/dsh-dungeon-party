import type { AgentRegistry } from '@deepseek-ai/dsh-agent';
import type { AgentPresets } from '@deepseek-ai/dsh-agent-presets';
import { type Actor, type CheckpointRequest, type CommanderRescueTicket, type DungeonService, type ExecutionReport, type PartyMessage, type PartyMessageInput, type PartySlot, type RecoveryInstruction, type ResurrectionRequest, type RunPhase, type TaskLease, type TaskRecord } from '../service/dungeon-service.js';
type ChildSlot = Exclude<PartySlot, 'tank'>;
export declare class PartyAgentManager {
    private readonly service;
    private readonly agents;
    private readonly presets;
    private readonly childRoute;
    private readonly handles;
    private readonly commanderHandles;
    private readonly dispatchedRecoveryIds;
    /**
     * Per-task workspace audit state. `snapshot` is the rolling baseline and
     * `accumulated` keeps every change observed across checkpoint re-baselines,
     * so a checkpoint can never silently absorb pre-existing (or out-of-scope)
     * modifications before the final submit audit.
     */
    private readonly leaseAudits;
    private readonly pending;
    /** Serializes dispatch per run so concurrent kicks cannot double-assign. */
    private readonly dispatchLocks;
    /** Serializes lease baselines and submit audits per run. */
    private readonly workspaceAuditLocks;
    /** Rate-limits dangling-lease turn-end nudges per session. */
    private readonly turnEndNudges;
    /** Rate-limits redispatch of assigned-but-unclaimed tasks per run/task. */
    private readonly redispatchAt;
    /** Last taskSetVersion per run for which a drained-execution notice fired. */
    private readonly drainNoticeTaskSetVersions;
    /** Agent contexts that already carry the execution guard listener. */
    private readonly guardedContexts;
    /**
     * Current run/slot binding per guarded context. The installed listener reads
     * this live so a context reused across runs never keeps a stale guard.
     */
    private readonly guardBindings;
    /** Unexpected scheduler errors, kept for diagnostics instead of failing post-commit flows. */
    readonly schedulerErrors: unknown[];
    constructor(service: DungeonService, agents: AgentRegistry, presets: AgentPresets, childRoute?: {
        provider?: string;
        model?: string;
    });
    /**
     * Child agent model route: explicit childRoute config wins over the tank's
     * creation-time options (the tank's live UI-side model selection is not
     * exposed on the rc8 Agent API and cannot be inherited automatically).
     */
    private childAgentOptions;
    restoreBoundParty(actor: Actor, runId: string): Promise<void>;
    prepareForPhase(actor: Actor, runId: string, phase: RunPhase): Promise<void>;
    kickScheduler(runId: string): Promise<string[]>;
    dispatchAvailableTasks(actor: Actor, runId: string): Promise<string[]>;
    /**
     * Periodic watchdog: revokes expired leases (notifying the owner and
     * redispatching the task), and escalates stalled progress from a checkpoint
     * nudge to a tank alert using the service's own clock.
     */
    runWatchdog(): Promise<void>;
    /**
     * Nudge a DPS whose turn ended while it still holds an active lease,
     * rate-limited to one nudge per session per minute.
     */
    nudgeAfterTurnEnd(sessionId: string): void;
    private withDispatchLock;
    private withWorkspaceAuditLock;
    private dispatchAvailableTasksUnlocked;
    /**
     * Orchestration loop closure: when a dispatch pass ends with the run fully
     * drained (EXECUTING/REPAIR, no pending/ready/running task, no active
     * lease, no in-flight recovery, and every required task completed), nudge
     * the tank Agent to call party_health and move the party toward
     * VALIDATING. The notice never mutates run state and is deduplicated per
     * runId+taskSetVersion so repeated kicks stay quiet until the task set
     * changes. Strictly best-effort: it must never break the scheduler.
     */
    private notifyDrainedExecution;
    executeValidatorMaintenance(actor: Actor, runId: string): Promise<RecoveryInstruction>;
    dispatchBattleRes(actor: Actor, runId: string, resurrectionId: string): void;
    dispatchCommanderRescue(runId: string, ticketId: string): void;
    ensureMember(actor: Actor, runId: string, slot: ChildSlot): Promise<string>;
    recoverCommander(actor: Actor, runId: string, ticketId: string): Promise<CommanderRescueTicket>;
    completeDpsResurrection(actor: Actor, runId: string, resurrectionId: string, mode: 'resume' | 'replace'): Promise<ResurrectionRequest>;
    requestCheckpoint(actor: Actor, runId: string, taskId: string): CheckpointRequest;
    claimTaskWithAudit(actor: Actor, runId: string, taskId: string): Promise<TaskLease>;
    beginLeaseAudit(actor: Actor, runId: string, taskId: string, leaseId: string): Promise<void>;
    submitExecutionWithAudit(actor: Actor, runId: string, report: ExecutionReport): Promise<TaskRecord>;
    auditWorkspaceBeforeSubmit(actor: Actor, runId: string, report: ExecutionReport): Promise<void>;
    private captureLeaseAudit;
    /**
     * Rebuild audit baselines for active leases that lost their in-memory
     * baseline (typically after a host restart). Changes made before the
     * rebuild are not attributable anymore; everything after is fully audited.
     */
    rebuildMissingLeaseAudits(runId: string): Promise<void>;
    private auditWorkspace;
    completeLeaseAudit(runId: string, taskId: string): void;
    /**
     * Re-baseline the workspace audit for an active lease after a checkpoint
     * renewed it. The delta since the previous baseline is accumulated first,
     * so the final submit audit still sees every change made across the whole
     * lease instead of only the slice after the last checkpoint.
     */
    refreshLeaseAudit(runId: string, taskId: string): Promise<void>;
    interruptTask(actor: Actor, runId: string, taskId: string, turnId: string): Promise<TaskRecord>;
    sendPartyMessage(actor: Actor, runId: string, toSlot: PartySlot, input: PartyMessageInput): PartyMessage;
    dispatchTask(actor: Actor, runId: string, taskId: string): void;
    forgetDisposedAgent(sessionId: string): void;
    disposeRun(runId: string): Promise<void>;
    dispose(): Promise<void>;
    /**
     * Install the execution guard at most once per agent context while keeping
     * the run/slot binding fresh: a context reused across runs reads the
     * current binding from the WeakMap instead of a stale closure.
     */
    private ensureGuardInstalled;
    private installExecutionGuard;
    private dispatchRecoveryToHealer;
    private ensureSubagentDescriptor;
    private restoreMember;
    private createMember;
}
export {};
