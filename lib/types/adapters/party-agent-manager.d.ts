import type { AgentRegistry } from '@deepseek-ai/dsh-agent';
import type { AgentPresets } from '@deepseek-ai/dsh-agent-presets';
import { type Actor, type DungeonService, type ExecutionReport, type PartyMessageInput, type PartySlot, type RunPhase } from '../service/dungeon-service.js';
type ChildSlot = Exclude<PartySlot, 'tank'>;
export declare class PartyAgentManager {
    private readonly service;
    private readonly agents;
    private readonly presets;
    private readonly childRoute;
    private readonly handles;
    private readonly commanderHandles;
    private readonly dispatchedRecoveryIds;
    private readonly leaseAudits;
    private readonly pending;
    /** Serializes dispatch per run so concurrent kicks cannot double-assign. */
    private readonly dispatchLocks;
    /** Rate-limits dangling-lease turn-end nudges per session. */
    private readonly turnEndNudges;
    /** Agent contexts that already carry the execution guard. */
    private readonly guardedContexts;
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
    private dispatchAvailableTasksUnlocked;
    executeValidatorMaintenance(actor: Actor, runId: string): Promise<void>;
    dispatchBattleRes(actor: Actor, runId: string, resurrectionId: string): void;
    dispatchCommanderRescue(runId: string, ticketId: string): void;
    ensureMember(actor: Actor, runId: string, slot: ChildSlot): Promise<string>;
    recoverCommander(actor: Actor, runId: string, ticketId: string): Promise<void>;
    completeDpsResurrection(actor: Actor, runId: string, resurrectionId: string, mode: 'resume' | 'replace'): Promise<string>;
    requestCheckpoint(actor: Actor, runId: string, taskId: string): void;
    beginLeaseAudit(actor: Actor, runId: string, taskId: string, leaseId: string): void;
    auditWorkspaceBeforeSubmit(actor: Actor, runId: string, report: ExecutionReport): void;
    completeLeaseAudit(runId: string, taskId: string): void;
    /**
     * Re-baseline the workspace audit for an active lease. Called when a
     * checkpoint renews the lease so pre-existing external noise no longer
     * blocks the eventual work_submit.
     */
    refreshLeaseAudit(runId: string, taskId: string): void;
    interruptTask(actor: Actor, runId: string, taskId: string, turnId: string): Promise<void>;
    sendPartyMessage(actor: Actor, runId: string, toSlot: PartySlot, input: PartyMessageInput): void;
    dispatchTask(actor: Actor, runId: string, taskId: string): void;
    forgetDisposedAgent(sessionId: string): void;
    disposeRun(runId: string): Promise<void>;
    dispose(): Promise<void>;
    /** Installs the execution guard at most once per agent context. */
    private ensureGuardInstalled;
    private installExecutionGuard;
    private dispatchRecoveryToHealer;
    private ensureSubagentDescriptor;
    private restoreMember;
    private createMember;
}
export {};
