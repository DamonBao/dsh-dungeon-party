export type PartySlot = 'tank' | 'dps-1' | 'dps-2' | 'dps-3' | 'healer';
export type DpsSlot = Extract<PartySlot, `dps-${number}`>;
export type RunPhase = 'FORMING' | 'PLANNING' | 'PLAN_REVIEW' | 'EXECUTING' | 'VALIDATING' | 'REPAIR' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type RunControlState = 'normal' | 'throttled' | 'paused' | 'recovering';
export type MemberReadiness = 'healthy' | 'degraded' | 'recovering' | 'unavailable';
export type MemberLifeState = 'alive' | 'down' | 'resurrection-requested' | 'resurrecting' | 'permanently-dead';
export type MemberActivityState = 'idle' | 'queued' | 'running' | 'waiting' | 'stopped';
export type TaskProgressState = 'on-track' | 'suspected-stalled' | 'stalled';
export type CommanderLoadState = 'normal' | 'pressured' | 'overloaded' | 'unavailable';
export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'blocked' | 'failed' | 'scope-violation';
export interface Actor {
    sessionId: string;
}
export interface AcceptanceCriterion {
    id: string;
    description: string;
    required: boolean;
}
export interface WorkOrder {
    id: string;
    runId: string;
    title: string;
    objective: string;
    inputs: string[];
    constraints: string[];
    acceptanceCriteria: AcceptanceCriterion[];
    readScopes: string[];
    writeScopes: string[];
    globalCommands?: string[];
    blockedBy: string[];
    expectedArtifacts: string[];
    priority: 'critical' | 'high' | 'normal' | 'low';
    required: boolean;
    version: number;
}
export interface TaskLease {
    leaseId: string;
    ownerSlot: DpsSlot;
    grantedAt: string;
    expiresAt: string;
    version: number;
}
export interface ModifiedAssertion {
    file: string;
    test?: string;
    reason: string;
}
export interface ExecutionReport {
    taskId: string;
    taskVersion: number;
    leaseId: string;
    leaseVersion: number;
    slot: DpsSlot;
    generation: number;
    status: 'completed' | 'blocked' | 'failed';
    summary: string;
    changedFiles: string[];
    modifiedAssertions?: ModifiedAssertion[];
    evidence: string[];
    commandsRun: Array<{
        command: string;
        exitCode?: number;
        summary: string;
    }>;
    risks: string[];
    remainingWork: string[];
    workspaceFingerprint?: string;
}
export interface DpsCheckpoint {
    checkpointId: string;
    taskId: string;
    taskVersion: number;
    leaseId: string;
    leaseVersion: number;
    slot: DpsSlot;
    completed: string[];
    nextSteps: string[];
    evidenceDelta: string[];
    blockers: string[];
    workspaceFingerprint: string;
    observedAt?: string;
}
export interface CheckpointRequest {
    requestId: string;
    runId: string;
    taskId: string;
    taskVersion: number;
    leaseId: string;
    leaseVersion: number;
    slot: DpsSlot;
    status: 'issued' | 'completed' | 'expired';
    issuedAt: string;
    dueAt: string;
    completedAt?: string;
}
export interface TaskRecord {
    workOrder: WorkOrder;
    status: TaskStatus;
    ownerSlot?: DpsSlot;
    activeLease?: TaskLease;
    progressState?: TaskProgressState;
    missedCheckpoints?: number;
    nextCheckpointDueAt?: string;
    lastCheckpoint?: DpsCheckpoint;
    currentTurnId?: string;
    interruptState?: 'requested' | 'completed' | 'failed';
    quarantinedFiles?: string[];
    quarantineReviewed?: boolean;
    repairRound: number;
    executionRetries: number;
    executionReports: ExecutionReport[];
}
export interface SlotBinding {
    runId: string;
    slot: PartySlot;
    currentSessionId?: string;
    generation: number;
    lifeState?: MemberLifeState;
    activityState?: MemberActivityState;
    readiness?: MemberReadiness;
    history: Array<{
        sessionId: string;
        generation: number;
        boundAt: string;
        unboundAt?: string;
        endReason?: string;
    }>;
}
export interface ValidationManifest {
    runId: string;
    manifestVersion: number;
    taskSetVersion: number;
    workspaceFingerprint: string;
    criteria: Array<{
        criterionId: string;
        taskId: string;
        taskVersion: number;
        description: string;
        required: boolean;
    }>;
    fingerprintIgnoreScopes: string[];
    createdAt: string;
}
export interface ValidationCheck {
    criterionId: string;
    status: 'pass' | 'fail' | 'blocked' | 'not-applicable';
    evidence: string[];
    notApplicableReason?: string;
}
export interface ValidationFinding {
    id: string;
    severity: 'critical' | 'major' | 'minor';
    ownerTaskId?: string;
    title: string;
    evidence: string;
    remediation: string;
}
export interface ValidationReport {
    runId: string;
    validationId: string;
    verdict: 'pass' | 'fail' | 'blocked';
    status: 'current' | 'stale';
    taskSetVersion: number;
    manifestVersion: number;
    workspaceFingerprint: string;
    checks: ValidationCheck[];
    findings: ValidationFinding[];
    summary: string;
    createdAt: string;
}
export type ValidationSubmission = Omit<ValidationReport, 'runId' | 'status' | 'createdAt'>;
export interface HealthSignal {
    id: string;
    runId: string;
    slot: PartySlot;
    source: 'runtime' | 'service' | 'agent-report' | 'commander';
    kind: 'turn-error' | 'timeout' | 'context-pressure' | 'budget-pressure' | 'tool-failure' | 'queue-pressure' | 'progress-stall';
    severity: 'warning' | 'critical';
    observedAt: string;
    windowMs: number;
    evidence: string[];
    version: number;
}
export type HealthSignalInput = Omit<HealthSignal, 'id' | 'runId' | 'observedAt' | 'version'>;
export interface PartyMessage {
    messageId: string;
    runId: string;
    fromSlot: PartySlot;
    toSlot: PartySlot;
    kind: 'progress' | 'blocked' | 'risk' | 'question' | 'decision' | 'notice';
    summary: string;
    evidence: string[];
    createdAt: string;
}
export type PartyMessageInput = Pick<PartyMessage, 'kind' | 'summary' | 'evidence'>;
export interface RecoveryInstruction {
    instructionId: string;
    runId: string;
    slot: 'healer';
    action: 'validator-maintenance';
    status: 'issued' | 'completed' | 'failed';
    issuedAt: string;
    expiresAt: string;
    completedAt?: string;
}
export interface ResurrectionRequest {
    resurrectionId: string;
    runId: string;
    targetSlot: DpsSlot;
    targetSessionId: string;
    status: 'issued' | 'consumed' | 'completed' | 'failed';
    requestedAt: string;
    expiresAt: string;
}
export interface CommanderRescueTicket {
    ticketId: string;
    runId: string;
    targetSlot: 'tank';
    targetSessionId: string;
    healerSessionId: string;
    commanderCheckpointId: string;
    status: 'issued' | 'consumed' | 'completed' | 'failed' | 'expired';
    issuedAt: string;
    expiresAt: string;
    recoveryExpiresAt?: string;
    version: number;
}
export interface CommanderCheckpoint {
    checkpointId: string;
    runId: string;
    phase: RunPhase;
    controlState: RunControlState;
    taskSetVersion: number;
    pendingDecisionIds: string[];
    activeLeaseIds: string[];
    memberReadiness: Partial<Record<PartySlot, MemberReadiness>>;
    workspaceFingerprint: string;
    createdAt: string;
}
export interface VerificationCommandRun {
    command: string;
    exitCode?: number;
    /** Spawn failure marker (e.g. ENOENT): the command never ran to completion. */
    errorCode?: string;
    errorMessage?: string;
    durationMs: number;
    outputExcerpt: string;
    beganAt: string;
}
export interface VerificationCommandResult {
    command: string;
    exitCode?: number;
    errorCode?: string;
    errorMessage?: string;
    durationMs: number;
    output?: string;
    outputExcerpt?: string;
    beganAt: string;
}
export interface DungeonRun {
    id: string;
    objective: string;
    workspaceRoot: string;
    workspaceFingerprint: string;
    phase: RunPhase;
    controlState: RunControlState;
    scopeEnforcementMode: EffectiveScopeEnforcementMode;
    taskSetVersion: number;
    slots: Record<PartySlot, SlotBinding>;
    tasks: Record<string, TaskRecord>;
    manifests: ValidationManifest[];
    validationReports: ValidationReport[];
    checkpointRequests: CheckpointRequest[];
    messages: PartyMessage[];
    healthSignals: HealthSignal[];
    recoveryInstructions: RecoveryInstruction[];
    commanderLoad: CommanderLoadState;
    commanderCheckpoint?: CommanderCheckpoint;
    battleResChargesRemaining: number;
    commanderBattleResChargesRemaining: number;
    resurrectionRequests: ResurrectionRequest[];
    commanderRescueTickets: CommanderRescueTicket[];
    verificationRuns: VerificationCommandRun[];
    resultSummary?: string;
    createdAt: string;
    updatedAt: string;
}
export interface DungeonEvent<T = unknown> {
    eventId: string;
    runId: string;
    sequence: number;
    schemaVersion: number;
    type: string;
    actorSessionId?: string;
    idempotencyKey?: string;
    occurredAt: string;
    payload: T;
}
export interface ExecutionGuardView {
    workspaceRoot: string;
    taskId: string;
    writeScopes: string[];
    globalCommands: string[];
}
export interface DungeonEventStore {
    append(event: DungeonEvent): void;
    load(runId: string): DungeonEvent[];
    loadAfter?(runId: string, afterSequence: number): DungeonEvent[];
    publishProjection?(run: DungeonRun): void;
    listRunIds?(): string[];
}
export type ScopeEnforcementMode = 'auto' | 'telemetry' | 'aggregate' | 'serial';
export type EffectiveScopeEnforcementMode = Exclude<ScopeEnforcementMode, 'auto'>;
export interface DungeonConfig {
    scopeEnforcementMode: ScopeEnforcementMode;
    effectiveScopeEnforcementMode: EffectiveScopeEnforcementMode;
    strictPerAgentWriteScopes: boolean;
    sessionWriteTelemetryAvailable: boolean;
    maxConcurrentDps: number;
    maxRepairRounds: number;
    maxExecutionRetries: number;
    battleResCharges: number;
    commanderBattleResCharges: number;
    resurrectionTimeoutMs: number;
    commanderRescueTicketTtlMs: number;
    commanderResurrectionTimeoutMs: number;
    maxGenerationsPerSlot: number;
    chargeOnFailedResurrection: boolean;
    progressCheckpointIntervalMs: number;
    checkpointResponseTimeoutMs: number;
    maxMissedCheckpoints: number;
    taskLeaseDurationMs: number;
    readinessEvaluationWindowMs: number;
    readinessWarningSignalCount: number;
    readinessCriticalSignalCount: number;
    commanderMaxPendingDecisions: number;
    commanderDecisionSlaMs: number;
    healerVerificationCommands: string[];
    healerVerificationTimeoutMs: number;
    fingerprintIgnoreScopes: string[];
    /**
     * Workspace paths the serial submit audit excuses when the executor did not
     * report them (toolchain byproducts such as lockfiles). They stay visible
     * to snapshots/fingerprints; only the changedFiles equality relaxes.
     */
    submitByproductScopes: string[];
    validationRequired: boolean;
}
export interface DungeonWaitResult {
    run: DungeonRun;
    events: DungeonEvent[];
    timedOut: boolean;
}
export interface DungeonServiceOptions {
    eventStore: DungeonEventStore;
    idGenerator?: () => string;
    /** Injectable auto run-id factory; defaults to {@link createReadableRunId}. */
    runIdGenerator?: () => string;
    clock?: () => string;
    /** Injected artifact-existence probe so the core stays testable off-host. */
    fileExists?: (absolutePath: string) => boolean;
    config?: Partial<DungeonConfig>;
    /** @deprecated Pass config.taskLeaseDurationMs instead. */
    taskLeaseDurationMs?: number;
    /** @deprecated Pass config.fingerprintIgnoreScopes instead. */
    fingerprintIgnoreScopes?: string[];
}
export interface StartRunInput {
    runId?: string;
    objective: string;
    workspaceRoot: string;
    workspaceFingerprint: string;
    tankSessionId: string;
}
/**
 * Human-readable, sortable default run id: `run-<UTC date>-<UTC time>-<8 hex>`.
 * Child session ids and subagent descriptor labels embed the run id, so a
 * readable run id keeps the whole party enumerable in the host UI instead of
 * surfacing raw UUIDs. The 8-hex suffix carries 32 bits of entropy, which
 * keeps same-second collision odds negligible for realistic burst starts.
 */
export declare function createReadableRunId(at?: Date, suffix?: string): string;
/**
 * Grace period a submit protection window keeps an expiring lease submittable
 * and shielded from sweeps. Bounded so a crashed caller cannot pin a lease.
 */
export declare const SUBMIT_PROTECTION_GRACE_MS = 60000;
export declare class DungeonError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare const defaultDungeonConfig: Readonly<DungeonConfig>;
export declare function resolveDungeonConfig(input: Partial<DungeonConfig>): DungeonConfig;
export declare class DungeonService {
    private readonly runs;
    private readonly eventStore;
    private readonly idGenerator;
    private readonly runIdGenerator;
    private readonly clock;
    private readonly fileExists;
    private readonly config;
    private readonly waiters;
    private readonly sequenceCounters;
    /** Serializes two-phase completion per run so concurrent finishes cannot interleave. */
    private readonly completionLocks;
    /**
     * Open submit windows per run/task. While a window is open, sweeps may not
     * revoke the task's lease and the submit itself tolerates a lease that
     * expired during the audit, so work finished in a long turn is never lost
     * to a concurrent poll-triggered sweep.
     */
    private readonly submitProtections;
    constructor(options: DungeonServiceOptions);
    private runIdInUse;
    startRun(input: StartRunInput): DungeonRun;
    recoverRun(runId: string): DungeonRun;
    bindMember(actor: Actor, runId: string, slot: Exclude<PartySlot, 'tank'>, sessionId: string): DungeonRun;
    changePhase(actor: Actor, runId: string, nextPhase: RunPhase): DungeonRun;
    createTask(actor: Actor, runId: string, workOrder: WorkOrder): TaskRecord;
    preflightTaskAssignment(actor: Actor, runId: string, taskId: string, slot: DpsSlot): TaskRecord;
    /**
     * Serial scope mode can carry exactly one claimable write task at a time.
     * True while another write task holds an active lease or is already
     * assigned awaiting its claim; read-only tasks are never blocked.
     */
    serialWriteBlocked(runId: string, taskId: string): boolean;
    private findSerialWriteBlocker;
    /**
     * Unified serial gate for every path that puts a write task into the
     * claimable state (tank assignment, scheduler dispatch, reassignment).
     */
    private assertSerialWriteAssignable;
    assignTask(actor: Actor, runId: string, taskId: string, slot: DpsSlot): TaskRecord;
    claimTask(actor: Actor, runId: string, taskId: string): TaskLease;
    submitExecution(actor: Actor, runId: string, report: ExecutionReport): TaskRecord;
    recordVerificationCommand(actor: Actor, runId: string, result: VerificationCommandResult): VerificationCommandRun;
    markMemberDown(runId: string, slot: DpsSlot, reason: string): DungeonRun;
    observeAgentDisposed(sessionId: string, reason: string): DungeonRun[];
    requestBattleRes(actor: Actor, runId: string, slot: DpsSlot, resurrectionId?: string): ResurrectionRequest;
    startBattleRes(actor: Actor, runId: string, resurrectionId: string): ResurrectionRequest;
    completeBattleRes(actor: Actor, runId: string, resurrectionId: string, outcome: {
        success: boolean;
        mode: 'resume' | 'replace';
        sessionId: string;
    }): ResurrectionRequest;
    markCommanderUnavailable(runId: string, reason: string): CommanderRescueTicket;
    consumeCommanderRescueTicket(actor: Actor, runId: string, ticketId: string): CommanderRescueTicket;
    expireCommanderRescueTickets(runId: string): DungeonRun;
    sweepExpiredState(runId: string): DungeonRun;
    completeCommanderResurrection(actor: Actor, runId: string, ticketId: string, outcome: {
        success: boolean;
        sessionId: string;
    }): CommanderRescueTicket;
    recoverRunAfterCommanderReturn(actor: Actor, runId: string): DungeonRun;
    resumeDispatch(actor: Actor, runId: string): DungeonRun;
    observeAgentTurnEnd(sessionId: string, reason: 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'interrupted', evidence: string[]): HealthSignal[];
    observeHealthSignal(runId: string, input: HealthSignalInput): HealthSignal;
    directValidatorMaintenance(actor: Actor, runId: string): RecoveryInstruction;
    completeValidatorMaintenance(actor: Actor, runId: string, instructionId: string, success: boolean): RecoveryInstruction;
    registerTaskTurn(runId: string, taskId: string, turnId: string): TaskRecord;
    requestTaskInterrupt(actor: Actor, runId: string, taskId: string, turnId: string): TaskRecord;
    completeTaskInterrupt(runId: string, taskId: string, turnId: string, result: {
        success: boolean;
        quarantinedFiles: string[];
    }): TaskRecord;
    reviewQuarantinedChanges(actor: Actor, runId: string, taskId: string): TaskRecord;
    reassignTask(actor: Actor, runId: string, taskId: string, ownerSlot: DpsSlot): TaskRecord;
    evaluateTaskProgress(runId: string, taskId: string, observations: {
        hasActiveLongTask?: boolean;
        hasRecentActivity?: boolean;
        hasBlockedEvidence?: boolean;
    }): TaskRecord;
    requestTaskCheckpoint(actor: Actor, runId: string, taskId: string): CheckpointRequest;
    submitCheckpoint(actor: Actor, runId: string, checkpoint: DpsCheckpoint): TaskRecord;
    observeCommanderLoad(runId: string, observation: {
        pendingDecisionIds: string[];
        oldestDecisionAgeMs: number;
        criticalSignal?: boolean;
    }): DungeonRun;
    reopenTask(actor: Actor, runId: string, taskId: string, findingIds: string[]): TaskRecord;
    /**
     * Retry a task whose execution report ended blocked/failed. This closes the
     * former dead end where a required task could neither reach VALIDATING
     * (required tasks incomplete) nor be reopened (no failed validation report
     * could ever be produced). The task returns to the schedulable pool with a
     * bumped task version so stale reports are rejected; the retry budget is
     * bounded by config.maxExecutionRetries.
     */
    retryExecution(actor: Actor, runId: string, taskId: string, reason: string): TaskRecord;
    observeWorkspaceFingerprint(runId: string, workspaceFingerprint: string): DungeonRun;
    createValidationManifest(actor: Actor, runId: string, workspaceFingerprint: string): ValidationManifest;
    submitValidation(actor: Actor, runId: string, submission: ValidationSubmission): ValidationReport;
    finishRun(actor: Actor, runId: string, resultSummary: string, workspaceFingerprint: string, recomputeFingerprint?: () => string | Promise<string>): Promise<DungeonRun>;
    private finishRunUnlocked;
    waitForChange(actor: Actor, runId: string, afterSequence: number, timeoutMs?: number, signal?: AbortSignal): Promise<DungeonWaitResult>;
    sendPartyMessage(actor: Actor, runId: string, toSlot: PartySlot, input: PartyMessageInput): PartyMessage;
    getFingerprintIgnoreScopes(): string[];
    /** Paths the serial submit audit excuses as toolchain byproducts. */
    getSubmitByproductScopes(): string[];
    /** Read-only healer verification allowlist for tool-layer preflight checks. */
    getHealerVerificationCommands(): string[];
    /** Read-only healer verification timeout cap for tool-layer preflight checks. */
    getHealerVerificationTimeoutMs(): number;
    /** Window in which observed session activity counts as "recently working". */
    getReadinessEvaluationWindowMs(): number;
    /**
     * Open a submit protection window for one task: sweeps skip its lease and
     * `submitExecution` tolerates a lease that expires inside the window, so
     * work finished in a long turn is never lost to a concurrent poll-triggered
     * sweep. The window is anchored strictly at `lease.expiresAt + grace` — a
     * lease already expired beyond the grace can never be re-protected, so a
     * late `protectSubmit` cannot revive stale work. Callers release eagerly in
     * a finally block.
     */
    protectSubmit(runId: string, taskId: string): void;
    /** Close a submit protection window opened by {@link protectSubmit}. */
    releaseSubmit(runId: string, taskId: string): void;
    /** Epoch ms until which the task's submit window shields it, if open. */
    private submitProtectedUntil;
    /** Enumerate in-memory run ids for watchdog sweeps and diagnostics. */
    listRunIds(): string[];
    /** Enumerate only mutable runs without cloning historical terminal state. */
    listActiveRunIds(): string[];
    getRun(runId: string): DungeonRun;
    /** Return the minimal immutable data needed by the high-frequency tool guard. */
    getExecutionGuardView(runId: string, slot: DpsSlot): ExecutionGuardView | undefined;
    assertRunAccess(actor: Actor, runId: string): void;
    getRunForActor(actor: Actor, runId: string): DungeonRun;
    private append;
    private reduce;
    private buildCommanderCheckpoint;
    private staleReports;
    private requireRun;
    private requireTank;
    private requireDps;
    private findSlot;
    private requireTask;
    private assertMutable;
    private assertRequiredTasksComplete;
}
