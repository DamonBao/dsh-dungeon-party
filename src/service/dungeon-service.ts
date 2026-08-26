import { matchesGlob } from 'node:path'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type PartySlot = 'tank' | 'dps-1' | 'dps-2' | 'dps-3' | 'healer'
export type DpsSlot = Extract<PartySlot, `dps-${number}`>
export type RunPhase =
  | 'FORMING'
  | 'PLANNING'
  | 'PLAN_REVIEW'
  | 'EXECUTING'
  | 'VALIDATING'
  | 'REPAIR'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
export type RunControlState = 'normal' | 'throttled' | 'paused' | 'recovering'
export type MemberReadiness = 'healthy' | 'degraded' | 'recovering' | 'unavailable'
export type MemberLifeState = 'alive' | 'down' | 'resurrection-requested' | 'resurrecting' | 'permanently-dead'
export type MemberActivityState = 'idle' | 'queued' | 'running' | 'waiting' | 'stopped'
export type TaskProgressState = 'on-track' | 'suspected-stalled' | 'stalled'
export type CommanderLoadState = 'normal' | 'pressured' | 'overloaded' | 'unavailable'
export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'scope-violation'

export interface Actor {
  sessionId: string
}

export interface AcceptanceCriterion {
  id: string
  description: string
  required: boolean
}

export interface WorkOrder {
  id: string
  runId: string
  title: string
  objective: string
  inputs: string[]
  constraints: string[]
  acceptanceCriteria: AcceptanceCriterion[]
  readScopes: string[]
  writeScopes: string[]
  globalCommands?: string[]
  blockedBy: string[]
  expectedArtifacts: string[]
  priority: 'critical' | 'high' | 'normal' | 'low'
  required: boolean
  version: number
}

export interface TaskLease {
  leaseId: string
  ownerSlot: DpsSlot
  grantedAt: string
  expiresAt: string
  version: number
}

export interface ModifiedAssertion {
  file: string
  test?: string
  reason: string
}

export interface ExecutionReport {
  taskId: string
  taskVersion: number
  leaseId: string
  leaseVersion: number
  slot: DpsSlot
  generation: number
  status: 'completed' | 'blocked' | 'failed'
  summary: string
  changedFiles: string[]
  modifiedAssertions?: ModifiedAssertion[]
  evidence: string[]
  commandsRun: Array<{ command: string; exitCode?: number; summary: string }>
  risks: string[]
  remainingWork: string[]
  workspaceFingerprint?: string
}

export interface DpsCheckpoint {
  checkpointId: string
  taskId: string
  taskVersion: number
  leaseId: string
  leaseVersion: number
  slot: DpsSlot
  completed: string[]
  nextSteps: string[]
  evidenceDelta: string[]
  blockers: string[]
  workspaceFingerprint: string
  observedAt?: string
}

export interface CheckpointRequest {
  requestId: string
  runId: string
  taskId: string
  taskVersion: number
  leaseId: string
  leaseVersion: number
  slot: DpsSlot
  status: 'issued' | 'completed' | 'expired'
  issuedAt: string
  dueAt: string
  completedAt?: string
}

export interface TaskRecord {
  workOrder: WorkOrder
  status: TaskStatus
  ownerSlot?: DpsSlot
  activeLease?: TaskLease
  progressState?: TaskProgressState
  missedCheckpoints?: number
  nextCheckpointDueAt?: string
  lastCheckpoint?: DpsCheckpoint
  currentTurnId?: string
  interruptState?: 'requested' | 'completed' | 'failed'
  quarantinedFiles?: string[]
  quarantineReviewed?: boolean
  repairRound: number
  executionRetries: number
  executionReports: ExecutionReport[]
}

export interface SlotBinding {
  runId: string
  slot: PartySlot
  currentSessionId?: string
  generation: number
  lifeState?: MemberLifeState
  activityState?: MemberActivityState
  readiness?: MemberReadiness
  history: Array<{
    sessionId: string
    generation: number
    boundAt: string
    unboundAt?: string
    endReason?: string
  }>
}

export interface ValidationManifest {
  runId: string
  manifestVersion: number
  taskSetVersion: number
  workspaceFingerprint: string
  criteria: Array<{
    criterionId: string
    taskId: string
    taskVersion: number
    description: string
    required: boolean
  }>
  fingerprintIgnoreScopes: string[]
  createdAt: string
}

export interface ValidationCheck {
  criterionId: string
  status: 'pass' | 'fail' | 'blocked' | 'not-applicable'
  evidence: string[]
  notApplicableReason?: string
}

export interface ValidationFinding {
  id: string
  severity: 'critical' | 'major' | 'minor'
  ownerTaskId?: string
  title: string
  evidence: string
  remediation: string
}

export interface ValidationReport {
  runId: string
  validationId: string
  verdict: 'pass' | 'fail' | 'blocked'
  status: 'current' | 'stale'
  taskSetVersion: number
  manifestVersion: number
  workspaceFingerprint: string
  checks: ValidationCheck[]
  findings: ValidationFinding[]
  summary: string
  createdAt: string
}

export type ValidationSubmission = Omit<ValidationReport, 'runId' | 'status' | 'createdAt'>

export interface HealthSignal {
  id: string
  runId: string
  slot: PartySlot
  source: 'runtime' | 'service' | 'agent-report' | 'commander'
  kind: 'turn-error' | 'timeout' | 'context-pressure' | 'budget-pressure' | 'tool-failure' | 'queue-pressure' | 'progress-stall'
  severity: 'warning' | 'critical'
  observedAt: string
  windowMs: number
  evidence: string[]
  version: number
}

export type HealthSignalInput = Omit<HealthSignal, 'id' | 'runId' | 'observedAt' | 'version'>

export interface PartyMessage {
  messageId: string
  runId: string
  fromSlot: PartySlot
  toSlot: PartySlot
  kind: 'progress' | 'blocked' | 'risk' | 'question' | 'decision' | 'notice'
  summary: string
  evidence: string[]
  createdAt: string
}

export type PartyMessageInput = Pick<PartyMessage, 'kind' | 'summary' | 'evidence'>

export interface RecoveryInstruction {
  instructionId: string
  runId: string
  slot: 'healer'
  action: 'validator-maintenance'
  status: 'issued' | 'completed' | 'failed'
  issuedAt: string
  expiresAt: string
  completedAt?: string
}

export interface ResurrectionRequest {
  resurrectionId: string
  runId: string
  targetSlot: DpsSlot
  targetSessionId: string
  status: 'issued' | 'consumed' | 'completed' | 'failed'
  requestedAt: string
  expiresAt: string
}

export interface CommanderRescueTicket {
  ticketId: string
  runId: string
  targetSlot: 'tank'
  targetSessionId: string
  healerSessionId: string
  commanderCheckpointId: string
  status: 'issued' | 'consumed' | 'completed' | 'failed' | 'expired'
  issuedAt: string
  expiresAt: string
  recoveryExpiresAt?: string
  version: number
}

export interface CommanderCheckpoint {
  checkpointId: string
  runId: string
  phase: RunPhase
  controlState: RunControlState
  taskSetVersion: number
  pendingDecisionIds: string[]
  activeLeaseIds: string[]
  memberReadiness: Partial<Record<PartySlot, MemberReadiness>>
  workspaceFingerprint: string
  createdAt: string
}

export interface VerificationCommandRun {
  command: string
  exitCode?: number
  /** Spawn failure marker (e.g. ENOENT): the command never ran to completion. */
  errorCode?: string
  errorMessage?: string
  durationMs: number
  outputExcerpt: string
  beganAt: string
}

export interface VerificationCommandResult {
  command: string
  exitCode?: number
  errorCode?: string
  errorMessage?: string
  durationMs: number
  output?: string
  outputExcerpt?: string
  beganAt: string
}

export interface DungeonRun {
  id: string
  objective: string
  workspaceRoot: string
  workspaceFingerprint: string
  phase: RunPhase
  controlState: RunControlState
  scopeEnforcementMode: EffectiveScopeEnforcementMode
  taskSetVersion: number
  slots: Record<PartySlot, SlotBinding>
  tasks: Record<string, TaskRecord>
  manifests: ValidationManifest[]
  validationReports: ValidationReport[]
  checkpointRequests: CheckpointRequest[]
  messages: PartyMessage[]
  healthSignals: HealthSignal[]
  recoveryInstructions: RecoveryInstruction[]
  commanderLoad: CommanderLoadState
  commanderCheckpoint?: CommanderCheckpoint
  battleResChargesRemaining: number
  commanderBattleResChargesRemaining: number
  resurrectionRequests: ResurrectionRequest[]
  commanderRescueTickets: CommanderRescueTicket[]
  verificationRuns: VerificationCommandRun[]
  resultSummary?: string
  createdAt: string
  updatedAt: string
}

export interface DungeonEvent<T = unknown> {
  eventId: string
  runId: string
  sequence: number
  schemaVersion: number
  type: string
  actorSessionId?: string
  idempotencyKey?: string
  occurredAt: string
  payload: T
}

export interface ExecutionGuardView {
  workspaceRoot: string
  taskId: string
  writeScopes: string[]
  globalCommands: string[]
}

export interface DungeonEventStore {
  append(event: DungeonEvent): void
  load(runId: string): DungeonEvent[]
  loadAfter?(runId: string, afterSequence: number): DungeonEvent[]
  publishProjection?(run: DungeonRun): void
  listRunIds?(): string[]
}

export type ScopeEnforcementMode = 'auto' | 'telemetry' | 'aggregate' | 'serial'
export type EffectiveScopeEnforcementMode = Exclude<ScopeEnforcementMode, 'auto'>

export interface DungeonConfig {
  scopeEnforcementMode: ScopeEnforcementMode
  effectiveScopeEnforcementMode: EffectiveScopeEnforcementMode
  strictPerAgentWriteScopes: boolean
  sessionWriteTelemetryAvailable: boolean
  maxConcurrentDps: number
  maxRepairRounds: number
  maxExecutionRetries: number
  battleResCharges: number
  commanderBattleResCharges: number
  resurrectionTimeoutMs: number
  commanderRescueTicketTtlMs: number
  commanderResurrectionTimeoutMs: number
  maxGenerationsPerSlot: number
  chargeOnFailedResurrection: boolean
  progressCheckpointIntervalMs: number
  checkpointResponseTimeoutMs: number
  maxMissedCheckpoints: number
  taskLeaseDurationMs: number
  readinessEvaluationWindowMs: number
  readinessWarningSignalCount: number
  readinessCriticalSignalCount: number
  commanderMaxPendingDecisions: number
  commanderDecisionSlaMs: number
  healerVerificationCommands: string[]
  healerVerificationTimeoutMs: number
  fingerprintIgnoreScopes: string[]
  /**
   * Workspace paths the serial submit audit excuses when the executor did not
   * report them (toolchain byproducts such as lockfiles). They stay visible
   * to snapshots/fingerprints; only the changedFiles equality relaxes.
   */
  submitByproductScopes: string[]
  validationRequired: boolean
}

export interface DungeonWaitResult {
  run: DungeonRun
  events: DungeonEvent[]
  timedOut: boolean
}

export interface DungeonServiceOptions {
  eventStore: DungeonEventStore
  idGenerator?: () => string
  clock?: () => string
  /** Injected artifact-existence probe so the core stays testable off-host. */
  fileExists?: (absolutePath: string) => boolean
  config?: Partial<DungeonConfig>
  /** @deprecated Pass config.taskLeaseDurationMs instead. */
  taskLeaseDurationMs?: number
  /** @deprecated Pass config.fingerprintIgnoreScopes instead. */
  fingerprintIgnoreScopes?: string[]
}

export interface StartRunInput {
  runId?: string
  objective: string
  workspaceRoot: string
  workspaceFingerprint: string
  tankSessionId: string
}

/**
 * Human-readable, sortable default run id: `run-<UTC date>-<UTC time>-<4 hex>`.
 * Child session ids and subagent descriptor labels embed the run id, so a
 * readable run id keeps the whole party enumerable in the host UI instead of
 * surfacing raw UUIDs.
 */
export function createReadableRunId(at: Date = new Date(), suffix: string = defaultRunIdSuffix()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`
  const time = `${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`
  return `run-${date}-${time}-${suffix}`
}

function defaultRunIdSuffix(): string {
  return crypto.randomUUID().slice(0, 4)
}

/**
 * Grace period a submit protection window keeps an expiring lease submittable
 * and shielded from sweeps. Bounded so a crashed caller cannot pin a lease.
 */
export const SUBMIT_PROTECTION_GRACE_MS = 60_000

export class DungeonError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DungeonError'
  }
}

export const defaultDungeonConfig: Readonly<DungeonConfig> = {
  scopeEnforcementMode: 'auto',
  effectiveScopeEnforcementMode: 'aggregate',
  strictPerAgentWriteScopes: false,
  sessionWriteTelemetryAvailable: false,
  maxConcurrentDps: 3,
  maxRepairRounds: 3,
  maxExecutionRetries: 3,
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
  healerVerificationCommands: ['npm test', 'npm run typecheck', 'npx tsc --noEmit', 'git status --short', 'git diff --stat', 'git diff --numstat'],
  healerVerificationTimeoutMs: 120_000,
  fingerprintIgnoreScopes: [
    '.git/**', 'node_modules/**', '.npm-cache/**', 'lib/**', 'dist/**', 'coverage/**', '.dsh/dungeon-party/tmp/**',
    // Common toolchain byproducts a lease may generate without the executor
    // reporting them; they must never break the submit audit.
    'tsconfig.tsbuildinfo', '.eslintcache', 'test-results/**', 'playwright-report/**',
    '.pytest_cache/**', '__pycache__/**', 'build/**', '.next/**', '*.log', '.DS_Store',
  ],
  submitByproductScopes: [
    'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
    '*.tsbuildinfo', '.eslintcache', '*.log', '.DS_Store',
  ],
  validationRequired: true,
}

export function resolveDungeonConfig(input: Partial<DungeonConfig>): DungeonConfig {
  const config: DungeonConfig = {
    ...defaultDungeonConfig,
    ...input,
    // Custom ignore scopes extend the defaults instead of replacing them: a
    // partial override that drops node_modules/** would make every audit walk
    // (and hash) the whole dependency tree.
    fingerprintIgnoreScopes: [...new Set([
      ...defaultDungeonConfig.fingerprintIgnoreScopes,
      ...(input.fingerprintIgnoreScopes ?? []),
    ])],
    submitByproductScopes: [...new Set([
      ...defaultDungeonConfig.submitByproductScopes,
      ...(input.submitByproductScopes ?? []),
    ])],
  }
  assert(
    ['auto', 'telemetry', 'aggregate', 'serial'].includes(config.scopeEnforcementMode),
    'INVALID_CONFIG',
    'scopeEnforcementMode is invalid',
  )
  if (config.scopeEnforcementMode === 'telemetry') {
    assert(config.sessionWriteTelemetryAvailable, 'INVALID_CONFIG', 'telemetry mode requires Session write telemetry')
    config.effectiveScopeEnforcementMode = 'telemetry'
  } else if (config.scopeEnforcementMode === 'auto') {
    // Until per-agent write telemetry is actually wired, the only honest
    // default is serialized write leases: aggregate audits compare against
    // the union of all active scopes and cannot attribute cross-task writes.
    config.effectiveScopeEnforcementMode = config.sessionWriteTelemetryAvailable
      ? 'telemetry'
      : 'serial'
  } else {
    config.effectiveScopeEnforcementMode = config.scopeEnforcementMode
  }
  const positiveIntegers: Array<keyof DungeonConfig> = [
    'maxConcurrentDps',
    'maxRepairRounds',
    'maxExecutionRetries',
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
    'healerVerificationTimeoutMs',
  ]
  for (const key of positiveIntegers) {
    const value = config[key]
    assert(typeof value === 'number' && Number.isInteger(value) && value >= 1, 'INVALID_CONFIG', `${key} must be a positive integer`)
  }
  assert(Array.isArray(config.healerVerificationCommands) && config.healerVerificationCommands.length > 0 && config.healerVerificationCommands.every((command) => typeof command === 'string' && command.trim().length > 0), 'INVALID_CONFIG', 'healerVerificationCommands must be a non-empty array of non-empty strings')
  assert(new Set(config.healerVerificationCommands).size === config.healerVerificationCommands.length, 'INVALID_CONFIG', 'healerVerificationCommands must be unique')
  assert(config.maxConcurrentDps <= 3, 'INVALID_CONFIG', 'maxConcurrentDps cannot exceed 3')
  assert(config.battleResCharges >= 0 && Number.isInteger(config.battleResCharges), 'INVALID_CONFIG', 'battleResCharges must be a non-negative integer')
  assert(config.commanderBattleResCharges >= 1 && Number.isInteger(config.commanderBattleResCharges), 'INVALID_CONFIG', 'commanderBattleResCharges must be a positive integer')
  const minimumLease = config.maxMissedCheckpoints *
    (config.progressCheckpointIntervalMs + config.checkpointResponseTimeoutMs)
  assert(config.taskLeaseDurationMs > minimumLease, 'INVALID_CONFIG', 'taskLeaseDurationMs must exceed all checkpoint observation windows')
  for (const scope of config.fingerprintIgnoreScopes) {
    assert(isSafeScope(scope), 'INVALID_CONFIG', `Unsafe fingerprint ignore scope: ${scope}`)
  }
  for (const scope of config.submitByproductScopes) {
    assert(isSafeScope(scope), 'INVALID_CONFIG', `Unsafe submit byproduct scope: ${scope}`)
  }
  return config
}

const slots: PartySlot[] = ['tank', 'dps-1', 'dps-2', 'dps-3', 'healer']
const dpsSlots: DpsSlot[] = ['dps-1', 'dps-2', 'dps-3']
const terminalPhases: RunPhase[] = ['COMPLETED', 'FAILED', 'CANCELLED']
const phaseTransitions: Record<RunPhase, RunPhase[]> = {
  FORMING: ['PLANNING', 'FAILED', 'CANCELLED'],
  PLANNING: ['PLAN_REVIEW', 'EXECUTING', 'FAILED', 'CANCELLED'],
  PLAN_REVIEW: ['PLANNING', 'EXECUTING', 'FAILED', 'CANCELLED'],
  EXECUTING: ['VALIDATING', 'REPAIR', 'FAILED', 'CANCELLED'],
  VALIDATING: ['COMPLETED', 'REPAIR', 'FAILED', 'CANCELLED'],
  REPAIR: ['EXECUTING', 'VALIDATING', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function jsonClone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    throw new DungeonError('NON_JSON_DATA', 'Dungeon state contains non-JSON-serializable data')
  }
}

function createEmptySlots(runId: string): Record<PartySlot, SlotBinding> {
  return {
    tank: { runId, slot: 'tank', generation: 0, history: [] },
    'dps-1': { runId, slot: 'dps-1', generation: 0, history: [] },
    'dps-2': { runId, slot: 'dps-2', generation: 0, history: [] },
    'dps-3': { runId, slot: 'dps-3', generation: 0, history: [] },
    healer: { runId, slot: 'healer', generation: 0, history: [] },
  }
}

function assert(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DungeonError(code, message)
}

function isSafeScope(scope: string): boolean {
  return (
    scope.length > 0 &&
    !scope.startsWith('/') &&
    !scope.startsWith('\\') &&
    !/^[A-Za-z]:/.test(scope) &&
    !scope.split('/').includes('..') &&
    !scope.includes('\\')
  )
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

function isWorkspaceGlobalCommand(command: string): boolean {
  return /^(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall|update|upgrade)\b/i.test(command) ||
    /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:format|fmt|codegen|generate|migrate)\b/i.test(command) ||
    /\b(?:prisma|drizzle|typeorm)\s+(?:generate|migrate)\b/i.test(command)
}

function normalizeWorkspacePath(path: string): string {
  const normalized = path.replace(/^\.\//, '').replace(/\/+$/, '')
  assert(isSafeScope(normalized), 'INVALID_SCOPE', `Unsafe workspace path: ${path}`)
  return normalized
}

function literalPrefix(scope: string): string[] {
  const segments = scope.split('/').filter(Boolean)
  const firstGlob = segments.findIndex((segment) => /[*?{}[\]]/.test(segment))
  return firstGlob === -1 ? segments : segments.slice(0, firstGlob)
}

function scopesOverlap(left: string, right: string): boolean {
  const a = literalPrefix(left)
  const b = literalPrefix(right)
  const commonLength = Math.min(a.length, b.length)
  for (let index = 0; index < commonLength; index += 1) {
    if (a[index] !== b[index]) return false
  }
  return true
}

function dependencyChainIncludes(
  tasks: Record<string, TaskRecord>,
  blockedBy: string[],
  targetTaskId: string,
): boolean {
  const pending = [...blockedBy]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const dependency = pending.pop()!
    if (dependency === targetTaskId) return true
    if (visited.has(dependency)) continue
    visited.add(dependency)
    const record = tasks[dependency]
    if (record) pending.push(...record.workOrder.blockedBy)
  }
  return false
}

export class DungeonService {
  private readonly runs = new Map<string, DungeonRun>()
  private readonly eventStore: DungeonEventStore
  private readonly idGenerator: () => string
  private readonly clock: () => string
  private readonly fileExists: (absolutePath: string) => boolean
  private readonly config: DungeonConfig
  private readonly waiters = new Map<string, Set<() => void>>()
  private readonly sequenceCounters = new Map<string, number>()
  /** Serializes two-phase completion per run so concurrent finishes cannot interleave. */
  private readonly completionLocks = new Map<string, Promise<unknown>>()
  /**
   * Open submit windows per run/task. While a window is open, sweeps may not
   * revoke the task's lease and the submit itself tolerates a lease that
   * expired during the audit, so work finished in a long turn is never lost
   * to a concurrent poll-triggered sweep.
   */
  private readonly submitProtections = new Map<string, Map<string, string>>()

  constructor(options: DungeonServiceOptions) {
    this.eventStore = options.eventStore
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID())
    this.clock = options.clock ?? (() => new Date().toISOString())
    this.fileExists = options.fileExists ?? existsSync
    this.config = resolveDungeonConfig({
      ...options.config,
      ...(options.taskLeaseDurationMs === undefined ? {} : { taskLeaseDurationMs: options.taskLeaseDurationMs }),
      ...(options.fingerprintIgnoreScopes === undefined ? {} : { fingerprintIgnoreScopes: options.fingerprintIgnoreScopes }),
    })
    for (const runId of this.eventStore.listRunIds?.() ?? []) this.recoverRun(runId)
  }

  startRun(input: StartRunInput): DungeonRun {
    assert(typeof input.objective === 'string' && input.objective.trim(), 'INVALID_OBJECTIVE', 'Run objective is required')
    assert(input.tankSessionId, 'INVALID_TANK', 'Tank session is required')
    const runId = input.runId ?? createReadableRunId()
    const storedEvents = this.eventStore.load(runId)
    const existing = this.runs.get(runId) ?? (storedEvents.length > 0 ? this.recoverRun(runId) : undefined)
    if (existing) {
      const sameCommand =
        existing.objective === input.objective &&
        existing.workspaceRoot === input.workspaceRoot &&
        existing.workspaceFingerprint === input.workspaceFingerprint &&
        existing.slots.tank.currentSessionId === input.tankSessionId
      assert(sameCommand, 'IDEMPOTENCY_CONFLICT', `Run ${runId} already exists with different start parameters`)
      return clone(existing)
    }
    const now = this.clock()
    const run: DungeonRun = {
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
      verificationRuns: [],
      createdAt: now,
      updatedAt: now,
    }
    this.append(run, 'dungeon/run-created', {
      objective: run.objective,
      workspaceRoot: run.workspaceRoot,
      workspaceFingerprint: run.workspaceFingerprint,
      scopeEnforcementMode: run.scopeEnforcementMode,
      battleResCharges: this.config.battleResCharges,
      commanderBattleResCharges: this.config.commanderBattleResCharges,
      createdAt: now,
    }, input.tankSessionId)
    this.append(run, 'dungeon/member-bound', {
      slot: 'tank',
      sessionId: input.tankSessionId,
      generation: 1,
      boundAt: this.clock(),
    }, input.tankSessionId)
    return clone(this.requireRun(runId))
  }

  recoverRun(runId: string): DungeonRun {
    const events = [...this.eventStore.load(runId)].sort((a, b) => a.sequence - b.sequence)
    assert(events.length > 0, 'RUN_NOT_FOUND', `Run ${runId} was not found`)
    let run: DungeonRun | undefined
    let expectedSequence = 1
    for (const event of events) {
      assert(event.sequence === expectedSequence, 'EVENT_SEQUENCE_GAP', `Expected event sequence ${expectedSequence}`)
      assert(event.schemaVersion === 1, 'UNSUPPORTED_EVENT_VERSION', `Unsupported event schema ${event.schemaVersion}`)
      run = this.reduce(run, event)
      expectedSequence += 1
    }
    assert(run, 'RUN_NOT_FOUND', `Run ${runId} was not found`)
    this.runs.set(runId, run)
    this.sequenceCounters.set(runId, expectedSequence)
    return clone(run)
  }

  bindMember(actor: Actor, runId: string, slot: Exclude<PartySlot, 'tank'>, sessionId: string): DungeonRun {
    const run = this.requireTank(actor, runId)
    this.assertMutable(run)
    const binding = run.slots[slot]
    assert(!binding.currentSessionId, 'SLOT_ALREADY_BOUND', `Slot ${slot} is already bound`)
    assert(!this.findSlot(run, sessionId), 'SESSION_ALREADY_BOUND', 'Session is already a party member')
    const updated = this.append(run, 'dungeon/member-bound', {
      slot,
      sessionId,
      generation: binding.generation + 1,
      boundAt: this.clock(),
    }, actor.sessionId)
    return clone(updated)
  }

  changePhase(actor: Actor, runId: string, nextPhase: RunPhase): DungeonRun {
    const run = this.requireTank(actor, runId)
    if (run.phase === nextPhase) return clone(run)
    this.assertMutable(run)
    assert(phaseTransitions[run.phase].includes(nextPhase), 'INVALID_PHASE_TRANSITION', `Cannot move from ${run.phase} to ${nextPhase}`)
    if (nextPhase === 'EXECUTING') {
      assert(run.slots.healer.currentSessionId, 'HEALER_REQUIRED', 'A healer must be bound before execution')
    }
    if (nextPhase === 'VALIDATING') {
      this.assertRequiredTasksComplete(run)
    }
    const updated = this.append(run, 'dungeon/phase-changed', { previousPhase: run.phase, phase: nextPhase }, actor.sessionId)
    return clone(updated)
  }

  createTask(actor: Actor, runId: string, workOrder: WorkOrder): TaskRecord {
    const run = this.requireTank(actor, runId)
    this.assertMutable(run)
    assert(['PLANNING', 'REPAIR'].includes(run.phase), 'INVALID_PHASE', 'Tasks can only be created while planning or repairing')
    assert(workOrder.runId === runId, 'RUN_ID_MISMATCH', 'Work order runId does not match')
    const existingTask = run.tasks[workOrder.id]
    if (existingTask) {
      assert(
        JSON.stringify(existingTask.workOrder) === JSON.stringify(workOrder),
        'IDEMPOTENCY_CONFLICT',
        `Task ${workOrder.id} already exists with different content`,
      )
      return clone(existingTask)
    }
    assert(typeof workOrder.objective === 'string' && workOrder.objective.trim(), 'INVALID_TASK', 'Task objective is required')
    assert(Number.isSafeInteger(workOrder.version) && workOrder.version >= 1, 'INVALID_TASK_VERSION', 'Task version must be at least 1')
    assert(Array.isArray(workOrder.acceptanceCriteria) && workOrder.acceptanceCriteria.length > 0, 'INVALID_TASK', 'At least one acceptance criterion is required')
    assert(
      workOrder.globalCommands === undefined ||
        (Array.isArray(workOrder.globalCommands) && workOrder.globalCommands.every((command) => typeof command === 'string')),
      'INVALID_GLOBAL_COMMAND',
      'Global commands must be strings',
    )
    const globalCommands = (workOrder.globalCommands ?? []).map(normalizeCommand)
    assert(globalCommands.every(Boolean), 'INVALID_GLOBAL_COMMAND', 'Global commands must not be empty')
    assert(new Set(globalCommands).size === globalCommands.length, 'INVALID_GLOBAL_COMMAND', 'Global commands must be unique within a work order')
    const ownedGlobalCommands = new Map(
      Object.values(run.tasks).flatMap((record) =>
        (record.workOrder.globalCommands ?? []).map((command) => [normalizeCommand(command), record.workOrder.id] as const),
      ),
    )
    for (const command of globalCommands) {
      assert(!ownedGlobalCommands.has(command), 'GLOBAL_COMMAND_CONFLICT', `Global command ${command} already belongs to ${ownedGlobalCommands.get(command)}`)
    }
    const existingCriterionIds = new Set(Object.values(run.tasks).flatMap((record) => record.workOrder.acceptanceCriteria.map((criterion) => criterion.id)))
    const localCriterionIds = new Set<string>()
    for (const criterion of workOrder.acceptanceCriteria) {
      assert(
        criterion && typeof criterion.id === 'string' && criterion.id &&
          typeof criterion.description === 'string' && criterion.description.trim(),
        'INVALID_CRITERION',
        'Criteria need an id and description',
      )
      assert(!existingCriterionIds.has(criterion.id) && !localCriterionIds.has(criterion.id), 'DUPLICATE_CRITERION', `Duplicate criterion ${criterion.id}`)
      localCriterionIds.add(criterion.id)
    }
    for (const scope of [...workOrder.readScopes, ...workOrder.writeScopes]) {
      assert(isSafeScope(scope), 'INVALID_SCOPE', `Unsafe workspace scope: ${scope}`)
    }
    for (const other of Object.values(run.tasks)) {
      const conflict = workOrder.writeScopes.some((scope) => other.workOrder.writeScopes.some((otherScope) => scopesOverlap(scope, otherScope)))
      const serializedByDag = dependencyChainIncludes(run.tasks, workOrder.blockedBy, other.workOrder.id)
      assert(!conflict || serializedByDag, 'WRITE_SCOPE_CONFLICT', `Task ${workOrder.id} overlaps write scopes with ${other.workOrder.id}`)
    }
    for (const dependency of workOrder.blockedBy) {
      assert(dependency !== workOrder.id, 'CYCLIC_DEPENDENCY', 'A task cannot block itself')
      assert(run.tasks[dependency], 'UNKNOWN_DEPENDENCY', `Unknown dependency ${dependency}`)
    }
    const updated = this.append(run, 'dungeon/task-created', { workOrder: clone(workOrder), taskSetVersion: run.taskSetVersion + 1 }, actor.sessionId)
    return clone(updated.tasks[workOrder.id]!)
  }

  preflightTaskAssignment(actor: Actor, runId: string, taskId: string, slot: DpsSlot): TaskRecord {
    const run = this.requireTank(actor, runId)
    assert(
      run.phase === 'EXECUTING' || run.phase === 'REPAIR',
      'INVALID_PHASE',
      `Task assignment requires EXECUTING or REPAIR; current phase is ${run.phase}. Call party_phase with phase=EXECUTING after all work orders are created.`,
    )
    const task = this.requireTask(run, taskId)
    if (task.ownerSlot === slot && task.status === 'ready') return clone(task)
    assert(['pending', 'ready'].includes(task.status) && !task.ownerSlot, 'TASK_NOT_ASSIGNABLE', `Task ${taskId} cannot be assigned`)
    const busySlotTask = Object.values(run.tasks).find((candidate) =>
      candidate.workOrder.id !== taskId &&
      candidate.ownerSlot === slot &&
      (candidate.status === 'ready' || candidate.status === 'running'),
    )
    assert(!busySlotTask, 'SLOT_BUSY', `Slot ${slot} already owns ${busySlotTask?.workOrder.id ?? 'another active task'}`)
    const unmet = task.workOrder.blockedBy.filter((dependency) => run.tasks[dependency]?.status !== 'completed')
    assert(unmet.length === 0, 'UNMET_DEPENDENCY', `Task is blocked by ${unmet.join(', ')}`)
    return clone(task)
  }

  assignTask(actor: Actor, runId: string, taskId: string, slot: DpsSlot): TaskRecord {
    const task = this.preflightTaskAssignment(actor, runId, taskId, slot)
    if (task.ownerSlot === slot && task.status === 'ready') return task
    const run = this.requireRun(runId)
    assert(run.slots[slot].currentSessionId, 'UNBOUND_SLOT', `Slot ${slot} is not bound`)
    const updated = this.append(run, 'dungeon/task-assigned', { taskId, ownerSlot: slot }, actor.sessionId)
    return clone(updated.tasks[taskId]!)
  }

  claimTask(actor: Actor, runId: string, taskId: string): TaskLease {
    const run = this.requireRun(runId)
    assert(
      run.phase === 'EXECUTING' || run.phase === 'REPAIR',
      'INVALID_PHASE',
      'Tasks can only be claimed during execution or repair',
    )
    assert(run.controlState === 'normal', 'DISPATCH_BLOCKED', 'Run dispatch is not normal')
    const actorSlot = this.requireDps(run, actor.sessionId)
    const binding = run.slots[actorSlot]
    assert(binding.lifeState === 'alive', 'MEMBER_NOT_ALIVE', `Slot ${actorSlot} is down and cannot claim work`)
    assert(binding.readiness !== 'unavailable', 'MEMBER_NOT_READY', `Slot ${actorSlot} is unavailable and cannot claim work`)
    const task = this.requireTask(run, taskId)
    assert(task.ownerSlot === actorSlot, 'FORBIDDEN', 'Task is not assigned to this DPS slot')
    assert(task.status === 'ready', 'TASK_NOT_CLAIMABLE', `Task ${taskId} is not ready (current status: ${task.status}${task.activeLease ? `; you already hold lease ${task.activeLease.leaseId}, submit via work_submit` : ''})`)
    assert(!task.activeLease, 'LEASE_EXISTS', 'Task already has an active lease')
    assert(run.slots.healer.currentSessionId, 'HEALER_REQUIRED', 'A healer must be bound before a write lease')
    assert(run.slots.healer.readiness !== 'unavailable', 'HEALER_UNAVAILABLE', 'The healer is unavailable; new write leases stay frozen')
    const activeDps = new Set(Object.values(run.tasks).flatMap((candidate) =>
      candidate.activeLease ? [candidate.activeLease.ownerSlot] : [],
    ))
    assert(
      !activeDps.has(actorSlot),
      'LEASE_ALREADY_HELD',
      `Slot ${actorSlot} already holds an active lease; submit or expire it before claiming another task`,
    )
    assert(
      activeDps.size < this.config.maxConcurrentDps,
      'MAX_CONCURRENT_DPS',
      `At most ${this.config.maxConcurrentDps} DPS slots may hold leases concurrently`,
    )
    if (run.scopeEnforcementMode === 'serial' && task.workOrder.writeScopes.length > 0) {
      const anotherWriter = Object.values(run.tasks).find((candidate) =>
        candidate.workOrder.id !== taskId &&
        candidate.workOrder.writeScopes.length > 0 &&
        candidate.activeLease,
      )
      assert(!anotherWriter, 'WRITE_DISPATCH_SERIALIZED', `Strict scope mode serializes write leases; ${anotherWriter?.workOrder.id} is active. Wait with party_wait until the active lease completes instead of retrying work_claim.`)
    }
    const grantedAt = this.clock()
    const lease: TaskLease = {
      leaseId: this.idGenerator(),
      ownerSlot: actorSlot,
      grantedAt,
      expiresAt: new Date(Date.parse(grantedAt) + this.config.taskLeaseDurationMs).toISOString(),
      version: 1,
    }
    this.append(run, 'dungeon/task-lease-granted', {
      taskId,
      lease,
      nextCheckpointDueAt: new Date(Date.parse(grantedAt) + this.config.progressCheckpointIntervalMs).toISOString(),
    }, actor.sessionId)
    return clone(lease)
  }

  submitExecution(actor: Actor, runId: string, report: ExecutionReport): TaskRecord {
    const run = this.requireRun(runId)
    const actorSlot = this.requireDps(run, actor.sessionId)
    const task = this.requireTask(run, report.taskId)
    const binding = run.slots[actorSlot]
    assert(task.ownerSlot === actorSlot && report.slot === actorSlot, 'FORBIDDEN', 'Execution report slot does not match the owner')
    assert(binding.generation === report.generation, 'STALE_GENERATION', 'Execution report generation is stale')
    assert(task.workOrder.version === report.taskVersion, 'STALE_TASK', 'Execution report task version is stale')
    const priorReport = task.executionReports.find((item) =>
      item.leaseId === report.leaseId && item.leaseVersion === report.leaseVersion,
    )
    if (priorReport) {
      assert(
        JSON.stringify(priorReport) === JSON.stringify(report),
        'IDEMPOTENCY_CONFLICT',
        'The same lease report was already submitted with different content',
      )
      return clone(task)
    }
    assert(task.activeLease, 'STALE_LEASE', 'Task has no active lease')
    assert(
      task.activeLease.leaseId === report.leaseId && task.activeLease.version === report.leaseVersion,
      'STALE_LEASE',
      'Execution report lease does not match the active lease',
    )
    const submitNowMs = Date.parse(this.clock())
    const protectedUntilMs = this.submitProtectedUntil(runId, report.taskId, submitNowMs)
    assert(
      submitNowMs <= Date.parse(task.activeLease.expiresAt) ||
        (protectedUntilMs !== undefined && submitNowMs <= protectedUntilMs),
      'LEASE_EXPIRED',
      'Task lease has expired',
    )
    assert(typeof report.summary === 'string' && report.summary.trim(), 'INVALID_REPORT', 'Execution summary is required')
    assert(
      Array.isArray(report.changedFiles) && Array.isArray(report.evidence) && Array.isArray(report.commandsRun) &&
        Array.isArray(report.risks) && Array.isArray(report.remainingWork),
      'INVALID_REPORT',
      'Execution report list fields are required',
    )
    assert(report.commandsRun.every((item) => item && typeof item.command === 'string' && typeof item.summary === 'string'), 'INVALID_REPORT', 'commandsRun entries are invalid')
    const changedTestFile = report.changedFiles.some((file) => typeof file === 'string' && /(?:^|\/)tests\/|\.test\.[^/]+$/.test(file))
    if (changedTestFile) {
      assert(report.modifiedAssertions !== undefined, 'MODIFIED_ASSERTIONS_REQUIRED', 'Test changes require modifiedAssertions disclosure')
      assert(Array.isArray(report.modifiedAssertions), 'INVALID_ARGS', 'modifiedAssertions must be an array')
      assert(report.modifiedAssertions.length > 0, 'MODIFIED_ASSERTIONS_REQUIRED', 'Test changes require modifiedAssertions disclosure')
    }
    if (report.modifiedAssertions !== undefined) {
      assert(Array.isArray(report.modifiedAssertions), 'INVALID_ARGS', 'modifiedAssertions must be an array')
      assert(report.modifiedAssertions.every((item) => item && typeof item.file === 'string' && item.file.trim() && typeof item.reason === 'string' && item.reason.trim() && (item.test === undefined || typeof item.test === 'string')), 'INVALID_ARGS', 'modifiedAssertions entries require non-empty file and reason')
    }
    assert(report.evidence.length > 0 || report.status !== 'completed', 'INVALID_REPORT', 'Completed work needs evidence')
    const globalCommandOwners = new Map(
      Object.values(run.tasks).flatMap((record) =>
        (record.workOrder.globalCommands ?? []).map((command) => [normalizeCommand(command), record.workOrder.id] as const),
      ),
    )
    const ownedCommands = new Set((task.workOrder.globalCommands ?? []).map(normalizeCommand))
    for (const commandResult of report.commandsRun) {
      const command = normalizeCommand(commandResult.command)
      const owner = globalCommandOwners.get(command)
      assert(!owner || owner === report.taskId, 'GLOBAL_COMMAND_CONFLICT', `Global command ${command} belongs to ${owner}`)
      assert(!isWorkspaceGlobalCommand(command) || ownedCommands.has(command), 'GLOBAL_COMMAND_UNOWNED', `Workspace-global command ${command} is not owned by this task`)
    }
    for (const changedFile of report.changedFiles) {
      const normalizedFile = normalizeWorkspacePath(changedFile)
      assert(!/[?*[\]{}]/.test(normalizedFile), 'INVALID_SCOPE', `Changed file must be a literal workspace path: ${changedFile}`)
      assert(
        task.workOrder.writeScopes.some((scope) => normalizedFile === scope || matchesGlob(normalizedFile, scope)),
        'WRITE_SCOPE_VIOLATION',
        `Changed file ${changedFile} is outside the task write scopes`,
      )
    }
    if (report.status === 'completed') {
      for (const changedFile of report.changedFiles) {
        const absolutePath = join(run.workspaceRoot, changedFile)
        assert(this.fileExists(absolutePath), 'ARTIFACT_NOT_FOUND', `Changed file does not exist on disk: ${changedFile}`)
      }
    }
    this.append(run, 'dungeon/task-submitted', { report: clone(report) }, actor.sessionId)
    return clone(this.requireRun(runId).tasks[report.taskId]!)
  }

  recordVerificationCommand(actor: Actor, runId: string, result: VerificationCommandResult): VerificationCommandRun {
    const run = this.requireRun(runId)
    assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the currently bound healer may record verification commands')
    assert(typeof result.command === 'string' && this.config.healerVerificationCommands.includes(result.command), 'INVALID_COMMAND', 'Verification command is not allowlisted')
    assert(Number.isInteger(result.durationMs) && result.durationMs >= 0, 'INVALID_ARGS', 'Verification duration must be a non-negative integer')
    assert(typeof result.beganAt === 'string' && result.beganAt.length > 0, 'INVALID_ARGS', 'Verification beganAt is required')
    assert(result.exitCode === undefined || Number.isInteger(result.exitCode), 'INVALID_ARGS', 'Verification exitCode must be an integer')
    assert(result.errorCode === undefined || (typeof result.errorCode === 'string' && result.errorCode.trim()), 'INVALID_ARGS', 'Verification errorCode must be a non-empty string')
    assert(result.errorMessage === undefined || typeof result.errorMessage === 'string', 'INVALID_ARGS', 'Verification errorMessage must be a string')
    const output = result.outputExcerpt ?? result.output ?? ''
    assert(typeof output === 'string', 'INVALID_ARGS', 'Verification output must be a string')
    const recorded: VerificationCommandRun = {
      command: result.command,
      ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
      ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }),
      ...(result.errorMessage === undefined ? {} : { errorMessage: result.errorMessage.slice(0, 500) }),
      durationMs: result.durationMs,
      outputExcerpt: output.slice(0, 4000),
      beganAt: result.beganAt,
    }
    this.append(run, 'dungeon/verification-command-run', recorded, actor.sessionId)
    return clone(recorded)
  }

  markMemberDown(runId: string, slot: DpsSlot, reason: string): DungeonRun {
    let run = this.requireRun(runId)
    this.assertMutable(run)
    assert(typeof reason === 'string' && reason.trim(), 'FAILURE_REASON_REQUIRED', 'A member failure reason is required')
    assert(run.slots[slot].currentSessionId, 'UNBOUND_SLOT', `Slot ${slot} is not bound`)
    if (run.slots[slot].lifeState !== 'down') {
      run = this.append(run, 'dungeon/member-down', { slot, reason })
    }
    for (const task of Object.values(run.tasks)) {
      if (task.ownerSlot === slot && task.activeLease) {
        run = this.append(run, 'dungeon/task-lease-revoked', {
          taskId: task.workOrder.id,
          leaseId: task.activeLease.leaseId,
          leaseVersion: task.activeLease.version,
          reason: 'member-down',
        })
      }
    }
    return clone(run)
  }

  observeAgentDisposed(sessionId: string, reason: string): DungeonRun[] {
    const affected: DungeonRun[] = []
    for (const run of [...this.runs.values()]) {
      if (terminalPhases.includes(run.phase)) continue
      const slot = this.findSlot(run, sessionId)
      if (!slot) continue
      if (slot === 'tank') {
        try {
          this.markCommanderUnavailable(run.id, reason)
        } catch (error) {
          // Before the healer is bound (FORMING/PLANNING) or once rescue
          // charges are exhausted there is no recoverable path. Fail the run
          // explicitly instead of throwing a domain error into the host event
          // bus.
          if (error instanceof DungeonError && (error.code === 'PARTY_NOT_RECOVERABLE' || error.code === 'NO_COMMANDER_RES_CHARGES')) {
            this.append(this.requireRun(run.id), 'dungeon/run-failed', {
              reason: error.code === 'PARTY_NOT_RECOVERABLE'
                ? 'commander-lost-before-party-recoverable'
                : 'commander-rescue-charges-exhausted',
            })
          } else {
            throw error
          }
        }
      } else if (slot === 'healer') {
        this.append(run, 'dungeon/member-readiness-changed', {
          slot,
          readiness: 'unavailable',
          signalIds: [],
        })
        // PRD §10.3: an unavailable validator freezes the run so DPS cannot
        // keep claiming write leases while nobody can adjudicate them.
        this.append(run, 'dungeon/dispatch-paused', { reason: 'healer-unavailable' })
      } else {
        this.markMemberDown(run.id, slot, reason)
      }
      affected.push(this.getRun(run.id))
    }
    return affected
  }

  requestBattleRes(
    actor: Actor,
    runId: string,
    slot: DpsSlot,
    resurrectionId = this.idGenerator(),
  ): ResurrectionRequest {
    const run = this.requireTank(actor, runId)
    const existing = run.resurrectionRequests.find((request) => request.resurrectionId === resurrectionId)
    if (existing) return clone(existing)
    const binding = run.slots[slot]
    assert(
      binding.currentSessionId && binding.lifeState === 'down',
      'MEMBER_NOT_DOWN',
      `Battle resurrection is only valid after runtime health evidence marks ${slot} down; current lifeState is ${binding.lifeState}. For a stalled but alive DPS, use party_request_checkpoint or party_interrupt instead.`,
    )
    assert(run.battleResChargesRemaining > 0, 'NO_BATTLE_RES_CHARGES', 'No DPS battle resurrection charges remain')
    assert(binding.generation < this.config.maxGenerationsPerSlot, 'MAX_GENERATION_REACHED', 'DPS slot reached its maximum generation')
    const requestedAt = this.clock()
    const request: ResurrectionRequest = {
      resurrectionId,
      runId,
      targetSlot: slot,
      targetSessionId: binding.currentSessionId,
      status: 'issued',
      requestedAt,
      expiresAt: new Date(Date.parse(requestedAt) + this.config.resurrectionTimeoutMs).toISOString(),
    }
    this.append(run, 'dungeon/resurrection-requested', { request }, actor.sessionId)
    return clone(request)
  }

  startBattleRes(actor: Actor, runId: string, resurrectionId: string): ResurrectionRequest {
    const run = this.requireRun(runId)
    assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can consume a battle resurrection')
    const request = run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId)
    assert(request, 'RESURRECTION_NOT_FOUND', 'Battle resurrection request was not found')
    assert(request.status === 'issued', 'RESURRECTION_ALREADY_CONSUMED', 'Battle resurrection request is no longer available')
    assert(Date.parse(this.clock()) <= Date.parse(request.expiresAt), 'RESURRECTION_EXPIRED', 'Battle resurrection request expired')
    const updated = this.append(run, 'dungeon/resurrection-started', { resurrectionId }, actor.sessionId)
    return clone(updated.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId)!)
  }

  completeBattleRes(
    actor: Actor,
    runId: string,
    resurrectionId: string,
    outcome: { success: boolean; mode: 'resume' | 'replace'; sessionId: string },
  ): ResurrectionRequest {
    const run = this.requireRun(runId)
    assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can complete battle resurrection')
    const request = run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId)
    assert(request?.status === 'consumed', 'RESURRECTION_NOT_ACTIVE', 'Battle resurrection is not active')
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
      }, actor.sessionId)
      throw new DungeonError('RESURRECTION_EXPIRED', 'Battle resurrection expired before completion')
    }
    const binding = run.slots[request.targetSlot]
    if (outcome.success && outcome.mode === 'resume') {
      assert(outcome.sessionId === request.targetSessionId, 'SESSION_MISMATCH', 'Resume must restore the original DPS Session')
    }
    if (outcome.success && outcome.mode === 'replace') {
      assert(outcome.sessionId !== request.targetSessionId, 'SESSION_MISMATCH', 'Replacement must use a new DPS Session')
      assert(binding.generation < this.config.maxGenerationsPerSlot, 'MAX_GENERATION_REACHED', 'DPS slot reached its maximum generation')
    }
    const updated = this.append(run, outcome.success && outcome.mode === 'replace' ? 'dungeon/member-rebound' : outcome.success ? 'dungeon/resurrection-completed' : 'dungeon/resurrection-failed', {
      resurrectionId,
      slot: request.targetSlot,
      previousSessionId: request.targetSessionId,
      sessionId: outcome.sessionId,
      generation: outcome.mode === 'replace' ? binding.generation + 1 : binding.generation,
      completedAt: this.clock(),
      chargeOnFailure: this.config.chargeOnFailedResurrection,
    }, actor.sessionId)
    return clone(updated.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId)!)
  }

  markCommanderUnavailable(runId: string, reason: string): CommanderRescueTicket {
    const run = this.requireRun(runId)
    const existing = run.commanderRescueTickets.find((ticket) => ticket.status === 'issued' || ticket.status === 'consumed')
    if (existing) return clone(existing)
    const tankSessionId = run.slots.tank.currentSessionId
    const healerSessionId = run.slots.healer.currentSessionId
    assert(tankSessionId && healerSessionId, 'PARTY_NOT_RECOVERABLE', 'Tank and healer must both be bound')
    assert(run.commanderBattleResChargesRemaining > 0, 'NO_COMMANDER_RES_CHARGES', 'No commander resurrection charges remain')
    let current = this.append(run, 'dungeon/member-down', { slot: 'tank', reason })
    current = this.append(current, 'dungeon/dispatch-paused', { reason: 'commander-unavailable' })
    const checkpoint = this.buildCommanderCheckpoint(current, [])
    current = this.append(current, 'dungeon/commander-checkpointed', { checkpoint })
    const issuedAt = this.clock()
    const ticket: CommanderRescueTicket = {
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
    }
    this.append(current, 'dungeon/commander-rescue-ticket-issued', { ticket })
    return clone(ticket)
  }

  consumeCommanderRescueTicket(actor: Actor, runId: string, ticketId: string): CommanderRescueTicket {
    const run = this.requireRun(runId)
    assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can consume commander rescue tickets')
    const ticket = run.commanderRescueTickets.find((item) => item.ticketId === ticketId)
    assert(ticket, 'TICKET_NOT_FOUND', 'Commander rescue ticket was not found')
    assert(ticket.status === 'issued', 'TICKET_ALREADY_CONSUMED', 'Commander rescue ticket is no longer available')
    assert(Date.parse(this.clock()) <= Date.parse(ticket.expiresAt), 'TICKET_EXPIRED', 'Commander rescue ticket expired')
    const updated = this.append(run, 'dungeon/commander-rescue-ticket-consumed', {
      ticketId,
      recoveryExpiresAt: new Date(Date.parse(this.clock()) + this.config.commanderResurrectionTimeoutMs).toISOString(),
    }, actor.sessionId)
    return clone(updated.commanderRescueTickets.find((item) => item.ticketId === ticketId)!)
  }

  expireCommanderRescueTickets(runId: string): DungeonRun {
    const run = this.requireRun(runId)
    const now = Date.parse(this.clock())
    for (const ticket of run.commanderRescueTickets.filter((item) => item.status === 'issued' && now > Date.parse(item.expiresAt))) {
      this.append(run, 'dungeon/commander-rescue-ticket-expired', { ticketId: ticket.ticketId })
    }
    return clone(this.requireRun(runId))
  }

  sweepExpiredState(runId: string): DungeonRun {
    const run = this.requireRun(runId)
    if (terminalPhases.includes(run.phase)) return clone(run)
    const now = Date.parse(this.clock())
    for (const task of Object.values(run.tasks)) {
      if (task.activeLease && now > Date.parse(task.activeLease.expiresAt)) {
        // An open submit window shields the lease: the executor is mid-submit
        // and a poll-triggered sweep must not revoke the work under it.
        if (this.submitProtectedUntil(runId, task.workOrder.id, now)) continue
        this.append(run, 'dungeon/task-lease-revoked', {
          taskId: task.workOrder.id,
          leaseId: task.activeLease.leaseId,
          leaseVersion: task.activeLease.version,
          reason: 'lease-expired',
        })
      }
    }
    for (const request of run.checkpointRequests.filter((item) => item.status === 'issued' && now > Date.parse(item.dueAt))) {
      this.append(run, 'dungeon/checkpoint-request-expired', { requestId: request.requestId })
    }
    for (const instruction of run.recoveryInstructions.filter((item) => item.status === 'issued' && now > Date.parse(item.expiresAt))) {
      this.append(run, 'dungeon/member-recovery-completed', {
        instructionId: instruction.instructionId,
        success: false,
        completedAt: this.clock(),
        reason: 'expired',
      })
    }
    for (const request of run.resurrectionRequests.filter((item) =>
      (item.status === 'issued' || item.status === 'consumed') && now > Date.parse(item.expiresAt),
    )) {
      this.append(run, 'dungeon/resurrection-failed', {
        resurrectionId: request.resurrectionId,
        slot: request.targetSlot,
        previousSessionId: request.targetSessionId,
        sessionId: request.targetSessionId,
        generation: run.slots[request.targetSlot].generation,
        completedAt: this.clock(),
        chargeOnFailure: this.config.chargeOnFailedResurrection,
        reason: 'expired',
      })
    }
    this.expireCommanderRescueTickets(runId)
    for (const ticket of run.commanderRescueTickets.filter((item) =>
      item.status === 'consumed' && now > Date.parse(item.recoveryExpiresAt ?? item.expiresAt),
    )) {
      this.append(run, 'dungeon/commander-resurrection-failed', {
        ticketId: ticket.ticketId,
        completedAt: this.clock(),
        reason: 'expired',
      })
    }
    return clone(this.requireRun(runId))
  }

  completeCommanderResurrection(
    actor: Actor,
    runId: string,
    ticketId: string,
    outcome: { success: boolean; sessionId: string },
  ): CommanderRescueTicket {
    const run = this.requireRun(runId)
    assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can complete commander resurrection')
    const ticket = run.commanderRescueTickets.find((item) => item.ticketId === ticketId)
    assert(ticket?.status === 'consumed', 'TICKET_NOT_ACTIVE', 'Commander rescue ticket is not active')
    if (Date.parse(this.clock()) > Date.parse(ticket.recoveryExpiresAt ?? ticket.expiresAt)) {
      this.append(run, 'dungeon/commander-resurrection-failed', {
        ticketId,
        completedAt: this.clock(),
        reason: 'expired',
      }, actor.sessionId)
      throw new DungeonError('TICKET_EXPIRED', 'Commander rescue ticket expired before completion')
    }
    assert(outcome.sessionId === ticket.targetSessionId, 'COMMANDER_REPLACE_FORBIDDEN', 'Commander resurrection may only restore the original Lead Session')
    const updated = this.append(run, outcome.success ? 'dungeon/commander-resurrection-completed' : 'dungeon/commander-resurrection-failed', {
      ticketId,
      completedAt: this.clock(),
    }, actor.sessionId)
    return clone(updated.commanderRescueTickets.find((item) => item.ticketId === ticketId)!)
  }

  recoverRunAfterCommanderReturn(actor: Actor, runId: string): DungeonRun {
    let run = this.requireTank(actor, runId)
    this.assertMutable(run)
    if (run.controlState === 'normal' && run.slots.tank.lifeState === 'alive') return clone(run)
    this.sweepExpiredState(runId)
    run = this.requireTank(actor, runId)
    const ticket = run.commanderRescueTickets.find((item) => item.status === 'issued' || item.status === 'consumed')
    const updated = this.append(run, 'dungeon/commander-returned', {
      resumedAt: this.clock(),
      ...(ticket ? { ticketId: ticket.ticketId, refundCharge: ticket.status === 'issued' } : {}),
    }, actor.sessionId)
    return clone(updated)
  }

  resumeDispatch(actor: Actor, runId: string): DungeonRun {
    const run = this.requireTank(actor, runId)
    assert(
      run.controlState === 'recovering' || run.controlState === 'throttled' || run.controlState === 'paused',
      'DISPATCH_NOT_PAUSED',
      'Dispatch is not ready to resume',
    )
    assert(run.slots.tank.readiness === 'recovering' || run.commanderLoad !== 'unavailable', 'COMMANDER_NOT_RECOVERED', 'Commander is not recovered')
    if (run.controlState === 'paused') {
      // A frozen run (PRD §10.3) only thaws once a healthy validator is back
      // and the commander is alive; commander-caused recovering/throttled
      // states keep their original resume semantics above.
      assert(
        run.slots.healer.readiness === 'healthy' && run.slots.tank.lifeState === 'alive',
        'HEALER_NOT_RECOVERED',
        'A paused run can only resume after the healer readiness is healthy and the tank is alive',
      )
    }
    const updated = this.append(run, 'dungeon/dispatch-resumed', { resumedAt: this.clock() }, actor.sessionId)
    return clone(updated)
  }

  observeAgentTurnEnd(
    sessionId: string,
    reason: 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'interrupted',
    evidence: string[],
  ): HealthSignal[] {
    if (reason === 'completed' || reason === 'aborted') return []
    const signals: HealthSignal[] = []
    for (const run of this.runs.values()) {
      if (terminalPhases.includes(run.phase)) continue
      const slot = this.findSlot(run, sessionId)
      if (!slot) continue
      const severity: HealthSignal['severity'] = reason === 'error' || reason === 'interrupted' ? 'critical' : 'warning'
      const kind: HealthSignal['kind'] = reason === 'error'
        ? 'turn-error'
        : reason === 'interrupted'
          ? 'timeout'
          : reason === 'max-tokens'
            ? 'context-pressure'
            : 'progress-stall'
      signals.push(this.observeHealthSignal(run.id, {
        slot,
        source: 'runtime',
        kind,
        severity,
        windowMs: this.config.readinessEvaluationWindowMs,
        evidence,
      }))
    }
    return signals
  }

  observeHealthSignal(runId: string, input: HealthSignalInput): HealthSignal {
    const run = this.requireRun(runId)
    this.assertMutable(run)
    assert(run.slots[input.slot].currentSessionId, 'UNBOUND_SLOT', `Slot ${input.slot} is not bound`)
    assert(input.evidence.length > 0, 'MISSING_EVIDENCE', 'Health signals require evidence')
    assert(input.windowMs > 0, 'INVALID_HEALTH_SIGNAL', 'Health signal window must be positive')
    const observedAt = this.clock()
    const priorVersion = run.healthSignals
      .filter((signal) => signal.slot === input.slot)
      .reduce((maximum, signal) => Math.max(maximum, signal.version), 0)
    const signal: HealthSignal = {
      ...clone(input),
      id: this.idGenerator(),
      runId,
      observedAt,
      version: priorVersion + 1,
    }
    const updated = this.append(run, 'dungeon/member-health-signal-raised', { signal })
    const cutoff = Date.parse(observedAt) - this.config.readinessEvaluationWindowMs
    const recent = updated.healthSignals.filter(
      (item) => item.slot === input.slot && Date.parse(item.observedAt) >= cutoff,
    )
    const criticalCount = recent.filter((item) => item.severity === 'critical').length
    const warningCount = recent.filter((item) => item.severity === 'warning').length
    const nextReadiness: MemberReadiness | undefined =
      criticalCount >= this.config.readinessCriticalSignalCount
        ? 'unavailable'
        : warningCount >= this.config.readinessWarningSignalCount
          ? 'degraded'
          : undefined
    if (nextReadiness && updated.slots[input.slot].readiness !== nextReadiness) {
      this.append(updated, 'dungeon/member-readiness-changed', {
        slot: input.slot,
        readiness: nextReadiness,
        signalIds: recent.map((item) => item.id),
      })
      if (nextReadiness === 'unavailable' && input.slot === 'tank') {
        this.markCommanderUnavailable(runId, `objective health signals: ${recent.map((item) => item.id).join(', ')}`)
      } else if (nextReadiness === 'unavailable' && input.slot === 'healer') {
        // PRD §10.3: without an available validator, freeze new write leases
        // regardless of how the unavailability was signalled.
        this.append(this.requireRun(runId), 'dungeon/dispatch-paused', { reason: 'healer-unavailable' })
      } else if (nextReadiness === 'unavailable' && input.slot.startsWith('dps-')) {
        this.markMemberDown(
          runId,
          input.slot as DpsSlot,
          `objective health signals: ${recent.map((item) => item.id).join(', ')}`,
        )
      }
    }
    return clone(signal)
  }

  directValidatorMaintenance(actor: Actor, runId: string): RecoveryInstruction {
    const run = this.requireTank(actor, runId)
    assert(run.slots.healer.currentSessionId, 'HEALER_REQUIRED', 'A healer must be bound')
    assert(run.slots.healer.readiness === 'degraded', 'INVALID_READINESS', 'Healer must be degraded but responsive')
    assert(
      !run.recoveryInstructions.some((instruction) => instruction.status === 'issued'),
      'RECOVERY_IN_PROGRESS',
      'Healer already has an active recovery instruction',
    )
    const issuedAt = this.clock()
    const instruction: RecoveryInstruction = {
      instructionId: this.idGenerator(),
      runId,
      slot: 'healer',
      action: 'validator-maintenance',
      status: 'issued',
      issuedAt,
      expiresAt: new Date(Date.parse(issuedAt) + this.config.resurrectionTimeoutMs).toISOString(),
    }
    this.append(run, 'dungeon/member-recovery-directed', { instruction }, actor.sessionId)
    return clone(instruction)
  }

  completeValidatorMaintenance(actor: Actor, runId: string, instructionId: string, success: boolean): RecoveryInstruction {
    const run = this.requireRun(runId)
    assert(run.slots.healer.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound healer can complete maintenance')
    const instruction = run.recoveryInstructions.find((item) => item.instructionId === instructionId)
    assert(instruction?.status === 'issued', 'STALE_RECOVERY_INSTRUCTION', 'Recovery instruction is not active')
    const updated = this.append(run, success ? 'dungeon/member-recovery-completed' : 'dungeon/member-recovery-failed', {
      instructionId,
      completedAt: this.clock(),
    }, actor.sessionId)
    return clone(updated.recoveryInstructions.find((item) => item.instructionId === instructionId)!)
  }

  registerTaskTurn(runId: string, taskId: string, turnId: string): TaskRecord {
    const run = this.requireRun(runId)
    const task = this.requireTask(run, taskId)
    assert(task.status === 'running' && task.activeLease, 'TASK_NOT_RUNNING', 'Only a running leased task can register a Turn')
    assert(typeof turnId === 'string' && turnId.trim(), 'TURN_ID_REQUIRED', 'Turn id is required')
    const updated = this.append(run, 'dungeon/task-turn-registered', { taskId, turnId })
    return clone(updated.tasks[taskId]!)
  }

  requestTaskInterrupt(actor: Actor, runId: string, taskId: string, turnId: string): TaskRecord {
    const run = this.requireTank(actor, runId)
    const task = this.requireTask(run, taskId)
    assert(task.progressState === 'stalled', 'TASK_NOT_STALLED', 'Only a confirmed stalled task can be interrupted')
    assert(task.currentTurnId === turnId, 'TURN_ID_MISMATCH', 'Interrupt must reference the exact active Turn')
    assert(!task.interruptState, 'INTERRUPT_ALREADY_REQUESTED', 'Task interrupt already exists')
    const updated = this.append(run, 'dungeon/task-interrupt-requested', { taskId, turnId }, actor.sessionId)
    return clone(updated.tasks[taskId]!)
  }

  completeTaskInterrupt(
    runId: string,
    taskId: string,
    turnId: string,
    result: { success: boolean; quarantinedFiles: string[] },
  ): TaskRecord {
    const run = this.requireRun(runId)
    const task = this.requireTask(run, taskId)
    assert(task.interruptState === 'requested', 'INTERRUPT_NOT_REQUESTED', 'Task interrupt was not requested')
    assert(task.currentTurnId === turnId, 'TURN_ID_MISMATCH', 'Interrupt result must reference the active Turn')
    let current = this.append(run, result.success ? 'dungeon/task-interrupt-completed' : 'dungeon/task-interrupt-failed', {
      taskId,
      turnId,
      quarantinedFiles: clone(result.quarantinedFiles),
    })
    if (result.success && task.activeLease) {
      current = this.append(current, 'dungeon/task-lease-revoked', {
        taskId,
        leaseId: task.activeLease.leaseId,
        leaseVersion: task.activeLease.version,
        reason: 'turn-interrupted',
      })
    }
    if (result.success && result.quarantinedFiles.length > 0) {
      current = this.append(current, 'dungeon/workspace-changes-quarantined', {
        taskId,
        files: clone(result.quarantinedFiles),
        turnId,
      })
    }
    return clone(current.tasks[taskId]!)
  }

  reviewQuarantinedChanges(actor: Actor, runId: string, taskId: string): TaskRecord {
    const run = this.requireTank(actor, runId)
    const task = this.requireTask(run, taskId)
    assert(task.quarantinedFiles?.length, 'NO_QUARANTINED_CHANGES', 'Task has no quarantined changes')
    const updated = this.append(run, 'dungeon/workspace-quarantine-reviewed', { taskId }, actor.sessionId)
    return clone(updated.tasks[taskId]!)
  }

  reassignTask(actor: Actor, runId: string, taskId: string, ownerSlot: DpsSlot): TaskRecord {
    const run = this.requireTank(actor, runId)
    this.assertMutable(run)
    const task = this.requireTask(run, taskId)
    const ownerBinding = task.ownerSlot ? run.slots[task.ownerSlot] : undefined
    const ownerDown = ownerBinding?.lifeState === 'down' || ownerBinding?.lifeState === 'permanently-dead'
    assert(
      task.interruptState === 'completed' || ownerDown,
      'INTERRUPT_NOT_CONFIRMED',
      'Original Turn termination is not confirmed and the current owner is not down',
    )
    assert(!task.activeLease, 'ACTIVE_LEASE_EXISTS', 'Old lease must be revoked before reassignment')
    assert(!task.quarantinedFiles?.length || task.quarantineReviewed, 'QUARANTINE_REVIEW_REQUIRED', 'Quarantined workspace changes require tank review')
    assert(run.slots[ownerSlot].currentSessionId, 'UNBOUND_SLOT', `Slot ${ownerSlot} is not bound`)
    assert(run.slots[ownerSlot].lifeState === 'alive', 'MEMBER_NOT_ALIVE', `Slot ${ownerSlot} is down and cannot take work`)
    assert(task.ownerSlot !== ownerSlot, 'OWNER_UNCHANGED', 'Choose a different DPS owner')
    const busySlotTask = Object.values(run.tasks).find((candidate) =>
      candidate.workOrder.id !== taskId &&
      candidate.ownerSlot === ownerSlot &&
      (candidate.status === 'ready' || candidate.status === 'running'),
    )
    assert(!busySlotTask, 'SLOT_BUSY', `Slot ${ownerSlot} already owns ${busySlotTask?.workOrder.id ?? 'another active task'}`)
    const updated = this.append(run, 'dungeon/task-owner-reassigned', {
      taskId,
      previousOwnerSlot: task.ownerSlot,
      ownerSlot,
    }, actor.sessionId)
    return clone(updated.tasks[taskId]!)
  }

  evaluateTaskProgress(
    runId: string,
    taskId: string,
    observations: {
      hasActiveLongTask?: boolean
      hasRecentActivity?: boolean
      hasBlockedEvidence?: boolean
    },
  ): TaskRecord {
    const run = this.requireRun(runId)
    const task = this.requireTask(run, taskId)
    assert(task.status === 'running' && task.activeLease, 'TASK_NOT_RUNNING', 'Only a leased running task can be evaluated')
    if (observations.hasActiveLongTask || observations.hasRecentActivity || observations.hasBlockedEvidence) {
      return clone(task)
    }
    const now = Date.parse(this.clock())
    const due = Date.parse(task.nextCheckpointDueAt ?? task.activeLease.grantedAt)
    if (now <= due + this.config.checkpointResponseTimeoutMs) return clone(task)
    const missedCheckpoints = (task.missedCheckpoints ?? 0) + 1
    const progressState: TaskProgressState =
      missedCheckpoints >= this.config.maxMissedCheckpoints ? 'stalled' : 'suspected-stalled'
    const updated = this.append(run, progressState === 'stalled' ? 'dungeon/task-stall-confirmed' : 'dungeon/task-stall-suspected', {
      taskId,
      progressState,
      missedCheckpoints,
      nextCheckpointDueAt: new Date(now + this.config.progressCheckpointIntervalMs).toISOString(),
      evidence: ['checkpoint response window elapsed without registered activity or blocker'],
    })
    return clone(updated.tasks[taskId]!)
  }

  requestTaskCheckpoint(actor: Actor, runId: string, taskId: string): CheckpointRequest {
    const run = this.requireTank(actor, runId)
    const task = this.requireTask(run, taskId)
    assert(task.status === 'running' && task.activeLease && task.ownerSlot, 'TASK_NOT_RUNNING', 'Checkpoint requests require a running leased task')
    const existing = run.checkpointRequests.find((request) =>
      request.taskId === taskId &&
      request.leaseId === task.activeLease?.leaseId &&
      request.leaseVersion === task.activeLease.version &&
      request.status === 'issued',
    )
    if (existing) return clone(existing)
    const issuedAt = this.clock()
    const request: CheckpointRequest = {
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
    }
    this.append(run, 'dungeon/checkpoint-requested', { request }, actor.sessionId)
    return clone(request)
  }

  submitCheckpoint(actor: Actor, runId: string, checkpoint: DpsCheckpoint): TaskRecord {
    const run = this.requireRun(runId)
    const actorSlot = this.requireDps(run, actor.sessionId)
    const task = this.requireTask(run, checkpoint.taskId)
    assert(task.ownerSlot === actorSlot && checkpoint.slot === actorSlot, 'FORBIDDEN', 'Checkpoint owner does not match')
    assert(task.workOrder.version === checkpoint.taskVersion, 'STALE_TASK', 'Checkpoint task version is stale')
    assert(
      task.activeLease?.leaseId === checkpoint.leaseId && task.activeLease.version === checkpoint.leaseVersion,
      'STALE_LEASE',
      'Checkpoint lease is stale',
    )
    assert(Date.parse(this.clock()) <= Date.parse(task.activeLease.expiresAt), 'LEASE_EXPIRED', 'Task lease has expired')
    assert(
      Array.isArray(checkpoint.completed) && Array.isArray(checkpoint.nextSteps) &&
        Array.isArray(checkpoint.evidenceDelta) && Array.isArray(checkpoint.blockers),
      'INVALID_CHECKPOINT',
      'Checkpoint list fields are required',
    )
    assert(checkpoint.evidenceDelta.length > 0 || checkpoint.blockers.length > 0, 'MISSING_EVIDENCE', 'Checkpoint needs progress or blocker evidence')
    const observedAt = this.clock()
    const renewedLease: TaskLease = {
      ...task.activeLease,
      version: task.activeLease.version + 1,
      expiresAt: new Date(Date.parse(observedAt) + this.config.taskLeaseDurationMs).toISOString(),
    }
    const updated = this.append(run, 'dungeon/checkpoint-submitted', {
      checkpoint: { ...clone(checkpoint), observedAt },
      renewedLease,
      nextCheckpointDueAt: new Date(Date.parse(observedAt) + this.config.progressCheckpointIntervalMs).toISOString(),
    }, actor.sessionId)
    return clone(updated.tasks[checkpoint.taskId]!)
  }

  observeCommanderLoad(
    runId: string,
    observation: { pendingDecisionIds: string[]; oldestDecisionAgeMs: number; criticalSignal?: boolean },
  ): DungeonRun {
    const run = this.requireRun(runId)
    this.assertMutable(run)
    const countExceeded = observation.pendingDecisionIds.length >= this.config.commanderMaxPendingDecisions
    const slaExceeded = observation.oldestDecisionAgeMs >= this.config.commanderDecisionSlaMs
    const commanderLoad: CommanderLoadState = observation.criticalSignal || (countExceeded && slaExceeded)
      ? 'overloaded'
      : countExceeded || slaExceeded
        ? 'pressured'
        : 'normal'
    let current = run
    if (run.commanderLoad !== commanderLoad) {
      current = this.append(current, 'dungeon/commander-load-changed', { commanderLoad, ...clone(observation) })
    }
    if (commanderLoad === 'overloaded' && run.controlState !== 'throttled') {
      current = this.append(current, 'dungeon/dispatch-throttled', { reason: 'commander-overloaded' })
      const checkpoint: CommanderCheckpoint = {
        checkpointId: this.idGenerator(),
        runId,
        phase: current.phase,
        controlState: 'throttled',
        taskSetVersion: current.taskSetVersion,
        pendingDecisionIds: clone(observation.pendingDecisionIds),
        activeLeaseIds: Object.values(current.tasks).flatMap((task) => task.activeLease ? [task.activeLease.leaseId] : []),
        memberReadiness: Object.fromEntries(
          slots.flatMap((slot) => current.slots[slot].readiness ? [[slot, current.slots[slot].readiness]] : []),
        ),
        workspaceFingerprint: current.workspaceFingerprint,
        createdAt: this.clock(),
      }
      current = this.append(current, 'dungeon/commander-checkpointed', { checkpoint })
    }
    return clone(current)
  }

  reopenTask(actor: Actor, runId: string, taskId: string, findingIds: string[]): TaskRecord {
    const run = this.requireTank(actor, runId)
    assert(run.phase === 'REPAIR', 'INVALID_PHASE', 'Tasks can only be reopened during repair')
    const task = this.requireTask(run, taskId)
    const latestReport = run.validationReports.at(-1)
    assert(latestReport?.verdict === 'fail', 'FAILED_VALIDATION_REQUIRED', 'A failed validation report is required')
    assert(findingIds.length > 0, 'FINDINGS_REQUIRED', 'At least one finding must justify repair')
    const availableFindings = new Set(
      latestReport.findings
        .filter((finding) => finding.ownerTaskId === taskId)
        .map((finding) => finding.id),
    )
    assert(findingIds.every((id) => availableFindings.has(id)), 'UNKNOWN_FINDING', 'Repair findings must belong to the task')
    if (task.repairRound >= this.config.maxRepairRounds) {
      this.append(run, 'dungeon/run-failed', {
        reason: 'repair-limit-exceeded',
        taskId,
        maxRepairRounds: this.config.maxRepairRounds,
      }, actor.sessionId)
      throw new DungeonError('REPAIR_LIMIT_EXCEEDED', `Task ${taskId} exceeded the repair limit`)
    }
    const updated = this.append(run, 'dungeon/task-reopened', {
      taskId,
      findingIds: clone(findingIds),
      taskVersion: task.workOrder.version + 1,
      taskSetVersion: run.taskSetVersion + 1,
      repairRound: task.repairRound + 1,
    }, actor.sessionId)
    return clone(updated.tasks[taskId]!)
  }

  /**
   * Retry a task whose execution report ended blocked/failed. This closes the
   * former dead end where a required task could neither reach VALIDATING
   * (required tasks incomplete) nor be reopened (no failed validation report
   * could ever be produced). The task returns to the schedulable pool with a
   * bumped task version so stale reports are rejected; the retry budget is
   * bounded by config.maxExecutionRetries.
   */
  retryExecution(actor: Actor, runId: string, taskId: string, reason: string): TaskRecord {
    const run = this.requireTank(actor, runId)
    this.assertMutable(run)
    assert(
      run.phase === 'EXECUTING' || run.phase === 'REPAIR',
      'INVALID_PHASE',
      'Execution retries require EXECUTING or REPAIR',
    )
    const task = this.requireTask(run, taskId)
    assert(
      task.status === 'blocked' || task.status === 'failed',
      'TASK_NOT_RETRYABLE',
      `Only blocked or failed tasks can be retried (current status: ${task.status})`,
    )
    assert(!task.activeLease, 'ACTIVE_LEASE_EXISTS', 'The active lease must be revoked before a retry')
    assert(typeof reason === 'string' && reason.trim(), 'RETRY_REASON_REQUIRED', 'An auditable retry reason is required')
    assert(
      task.executionRetries < this.config.maxExecutionRetries,
      'RETRY_LIMIT_EXCEEDED',
      `Task ${taskId} exceeded the execution retry limit (${this.config.maxExecutionRetries})`,
    )
    const updated = this.append(run, 'dungeon/task-retried', {
      taskId,
      reason,
      taskVersion: task.workOrder.version + 1,
      taskSetVersion: run.taskSetVersion + 1,
      executionRetries: task.executionRetries + 1,
    }, actor.sessionId)
    return clone(updated.tasks[taskId]!)
  }

  observeWorkspaceFingerprint(runId: string, workspaceFingerprint: string): DungeonRun {
    const run = this.requireRun(runId)
    this.assertMutable(run)
    if (run.workspaceFingerprint === workspaceFingerprint) return clone(run)
    const updated = this.append(run, 'dungeon/workspace-fingerprint-observed', {
      previousFingerprint: run.workspaceFingerprint,
      workspaceFingerprint,
    })
    return clone(updated)
  }

  createValidationManifest(actor: Actor, runId: string, workspaceFingerprint: string): ValidationManifest {
    const run = this.requireRun(runId)
    const actorSlot = this.findSlot(run, actor.sessionId)
    assert(actorSlot === 'tank' || actorSlot === 'healer', 'FORBIDDEN', 'Only tank or healer can access validation manifests')
    assert(run.phase === 'VALIDATING', 'INVALID_PHASE', 'Validation manifest requires VALIDATING phase')
    this.assertRequiredTasksComplete(run)
    const latest = run.manifests.at(-1)
    if (latest && latest.taskSetVersion === run.taskSetVersion && latest.workspaceFingerprint === workspaceFingerprint) {
      return clone(latest)
    }
    assert(actorSlot === 'tank', 'MANIFEST_REFRESH_REQUIRED', 'Only tank can create a manifest for a changed workspace')
    const manifest: ValidationManifest = {
      runId,
      manifestVersion: (latest?.manifestVersion ?? 0) + 1,
      taskSetVersion: run.taskSetVersion,
      workspaceFingerprint,
      criteria: Object.values(run.tasks).flatMap((record) =>
        record.workOrder.acceptanceCriteria.map((criterion) => ({
          criterionId: criterion.id,
          taskId: record.workOrder.id,
          taskVersion: record.workOrder.version,
          description: criterion.description,
          required: record.workOrder.required && criterion.required,
        })),
      ),
      fingerprintIgnoreScopes: clone(this.config.fingerprintIgnoreScopes),
      createdAt: this.clock(),
    }
    this.append(run, 'dungeon/validation-manifest-created', { manifest }, actor.sessionId)
    return clone(manifest)
  }

  submitValidation(actor: Actor, runId: string, submission: ValidationSubmission): ValidationReport {
    const run = this.requireRun(runId)
    const healerSlot = this.findSlot(run, actor.sessionId)
    assert(healerSlot === 'healer', 'FORBIDDEN', 'Only the bound healer can submit validation')
    assert(run.slots.healer.readiness !== 'unavailable', 'HEALER_UNAVAILABLE', 'An unavailable healer cannot submit validation')
    assert(run.phase === 'VALIDATING', 'INVALID_PHASE', 'Run is not validating')
    assert(Array.isArray(submission.checks) && Array.isArray(submission.findings), 'INVALID_VALIDATION', 'Validation checks and findings are required')
    assert(typeof submission.summary === 'string' && submission.summary.trim(), 'INVALID_VALIDATION', 'Validation summary is required')
    const priorReport = run.validationReports.find((report) => report.validationId === submission.validationId)
    if (priorReport) {
      const candidate: ValidationReport = {
        ...clone(submission),
        runId,
        status: priorReport.status,
        createdAt: priorReport.createdAt,
      }
      assert(
        JSON.stringify(priorReport) === JSON.stringify(candidate),
        'IDEMPOTENCY_CONFLICT',
        `Validation ${submission.validationId} was already submitted with different content`,
      )
      return clone(priorReport)
    }
    const manifest = run.manifests.at(-1)
    assert(manifest, 'MANIFEST_REQUIRED', 'A validation manifest is required')
    assert(
      submission.manifestVersion === manifest.manifestVersion &&
        submission.taskSetVersion === manifest.taskSetVersion &&
        submission.workspaceFingerprint === manifest.workspaceFingerprint,
      'STALE_VALIDATION',
      'Validation report does not match the current manifest',
    )
    const manifestById = new Map(manifest.criteria.map((criterion) => [criterion.criterionId, criterion]))
    const seen = new Set<string>()
    for (const check of submission.checks) {
      assert(check && typeof check.criterionId === 'string' && Array.isArray(check.evidence), 'INVALID_VALIDATION', 'Validation check is malformed')
      const criterion = manifestById.get(check.criterionId)
      assert(criterion, 'UNKNOWN_CRITERION', `Unknown criterion ${check.criterionId}`)
      assert(!seen.has(check.criterionId), 'DUPLICATE_CHECK', `Duplicate check ${check.criterionId}`)
      seen.add(check.criterionId)
      if (check.status === 'not-applicable') {
        assert(!criterion.required && check.notApplicableReason?.trim(), 'INVALID_NOT_APPLICABLE', 'Required criteria cannot be N/A and optional N/A needs a reason')
      }
      if (check.status === 'fail' || check.status === 'blocked') {
        assert(check.evidence.length > 0, 'MISSING_EVIDENCE', 'Failed or blocked checks need evidence')
      }
    }
    if (submission.verdict === 'pass') {
      const required = manifest.criteria.filter((criterion) => criterion.required)
      const allPassed = required.every((criterion) => {
        const check = submission.checks.find((item) => item.criterionId === criterion.criterionId)
        return check?.status === 'pass'
      })
      assert(allPassed, 'INCOMPLETE_VALIDATION', 'Pass must cover every required criterion exactly once')
      assert(
        !submission.findings.some((finding) => finding.severity === 'critical' || finding.severity === 'major'),
        'PASS_HAS_BLOCKING_FINDINGS',
        'Pass cannot contain critical or major findings',
      )
    }
    const report: ValidationReport = {
      ...clone(submission),
      runId,
      status: 'current',
      createdAt: this.clock(),
    }
    this.append(run, 'dungeon/validation-submitted', { report }, actor.sessionId)
    return clone(report)
  }

  async finishRun(
    actor: Actor,
    runId: string,
    resultSummary: string,
    workspaceFingerprint: string,
    recomputeFingerprint?: () => string | Promise<string>,
  ): Promise<DungeonRun> {
    // Serialize completion attempts per run: the two-phase gate awaits a
    // workspace recompute, and overlapping finishes (or a cancel landing in
    // that window) must not interleave prepared/completed events.
    const previous = this.completionLocks.get(runId) ?? Promise.resolve()
    const chained = previous.catch(() => undefined).then(() =>
      this.finishRunUnlocked(actor, runId, resultSummary, workspaceFingerprint, recomputeFingerprint),
    )
    this.completionLocks.set(runId, chained)
    try {
      return await chained
    } finally {
      if (this.completionLocks.get(runId) === chained) this.completionLocks.delete(runId)
    }
  }

  private async finishRunUnlocked(
    actor: Actor,
    runId: string,
    resultSummary: string,
    workspaceFingerprint: string,
    recomputeFingerprint?: () => string | Promise<string>,
  ): Promise<DungeonRun> {
    const run = this.requireTank(actor, runId)
    assert(run.phase === 'VALIDATING', 'INVALID_PHASE', 'Only a validating run can be completed')
    assert(run.controlState === 'normal', 'RUN_NOT_READY', 'Run control state must be normal')
    assert(typeof resultSummary === 'string' && resultSummary.trim(), 'SUMMARY_REQUIRED', 'A user-facing result summary is required')
    this.assertRequiredTasksComplete(run)
    assert(
      run.slots.tank.readiness === 'healthy' && run.slots.healer.readiness === 'healthy',
      'MEMBER_NOT_READY',
      'Tank and healer must be healthy before completion',
    )
    assert(
      !Object.values(run.tasks).some((task) => task.progressState === 'stalled'),
      'UNRESOLVED_STALL',
      'Stalled tasks remain unresolved',
    )
    assert(
      !run.resurrectionRequests.some((request) => request.status === 'issued' || request.status === 'consumed') &&
        !run.commanderRescueTickets.some((ticket) => ticket.status === 'issued' || ticket.status === 'consumed') &&
        !run.recoveryInstructions.some((instruction) => instruction.status === 'issued') &&
        !run.checkpointRequests.some((request) => request.status === 'issued'),
      'RECOVERY_IN_PROGRESS',
      'A recovery or resurrection is still active',
    )
    const manifest = run.manifests.at(-1)
    const report = run.validationReports.at(-1)
    if (this.config.validationRequired) {
      assert(manifest && report, 'VALIDATION_REQUIRED', 'A current pass report is required')
      assert(report!.status === 'current' && report!.verdict === 'pass', 'VALIDATION_REQUIRED', 'A current pass report is required')
      assert(
        report!.taskSetVersion === run.taskSetVersion &&
          report!.manifestVersion === manifest!.manifestVersion &&
          report!.workspaceFingerprint === workspaceFingerprint &&
          manifest!.workspaceFingerprint === workspaceFingerprint,
        'STALE_VALIDATION',
        'Workspace or task set changed after validation',
      )
      assert(
        !report!.findings.some((finding) => finding.severity === 'critical' || finding.severity === 'major'),
        'VALIDATION_REQUIRED',
        'Blocking findings remain',
      )
    }
    this.append(run, 'dungeon/run-completion-prepared', {
      taskSetVersion: run.taskSetVersion,
      manifestVersion: manifest?.manifestVersion ?? 0,
      workspaceFingerprint,
    }, actor.sessionId)
    const preparedSequence = this.sequenceCounters.get(run.id)
    // PRD §14.1 two-phase completion: after preparing, recompute the
    // workspace fingerprint and only commit the terminal event when the
    // workspace is unchanged AND no other command landed during the await;
    // otherwise fail safely and keep the run validating against a now-stale
    // acceptance report.
    if (recomputeFingerprint) {
      const actualFingerprint = await recomputeFingerprint()
      const latest = this.requireRun(runId)
      if (terminalPhases.includes(latest.phase)) {
        throw new DungeonError('COMPLETION_CONFLICT', `Run entered terminal phase ${latest.phase} during completion`)
      }
      const stateChanged = this.sequenceCounters.get(runId) !== preparedSequence ||
        latest.phase !== 'VALIDATING' ||
        latest.controlState !== 'normal'
      if (stateChanged || actualFingerprint !== workspaceFingerprint) {
        this.append(latest, 'dungeon/run-completion-aborted', {
          expectedFingerprint: workspaceFingerprint,
          actualFingerprint,
          taskSetVersion: run.taskSetVersion,
          manifestVersion: manifest?.manifestVersion ?? 0,
          reason: stateChanged ? 'state-changed-during-completion' : 'workspace-changed-during-completion',
        }, actor.sessionId)
        if (stateChanged) {
          throw new DungeonError(
            'COMPLETION_CONFLICT',
            'Run state changed during completion; re-check party state and validation before finishing',
          )
        }
        throw new DungeonError(
          'WORKSPACE_CHANGED_DURING_COMPLETION',
          `Workspace changed during completion: expected fingerprint ${workspaceFingerprint} but recomputed ${actualFingerprint}`,
        )
      }
    }
    const completed = this.append(this.requireRun(runId), 'dungeon/run-completed', { resultSummary }, actor.sessionId)
    return clone(completed)
  }

  async waitForChange(
    actor: Actor,
    runId: string,
    afterSequence: number,
    timeoutMs = 30_000,
    signal?: AbortSignal,
  ): Promise<DungeonWaitResult> {
    this.getRunForActor(actor, runId)
    assert(Number.isInteger(afterSequence) && afterSequence >= 0, 'INVALID_CURSOR', 'afterSequence must be a non-negative integer')
    assert(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120_000, 'INVALID_TIMEOUT', 'timeoutMs must be between 1 and 120000')
    const newerEvents = () => this.eventStore.loadAfter?.(runId, afterSequence) ??
      this.eventStore.load(runId).filter((event) => event.sequence > afterSequence)
    const immediate = newerEvents()
    if (immediate.length > 0) {
      return { run: this.getRunForActor(actor, runId), events: immediate, timedOut: false }
    }
    return await new Promise<DungeonWaitResult>((resolve, reject) => {
      const listeners = this.waiters.get(runId) ?? new Set<() => void>()
      this.waiters.set(runId, listeners)
      let settled = false
      const cleanup = () => {
        listeners.delete(onChange)
        if (listeners.size === 0) this.waiters.delete(runId)
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      const finish = (timedOut: boolean) => {
        if (settled) return
        const events = newerEvents()
        if (!timedOut && events.length === 0) return
        settled = true
        cleanup()
        resolve({ run: this.getRunForActor(actor, runId), events, timedOut })
      }
      const onChange = () => finish(false)
      const onAbort = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(signal?.reason ?? new Error('party_wait aborted'))
      }
      listeners.add(onChange)
      const timer = setTimeout(() => finish(true), timeoutMs)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
      else onChange()
    })
  }

  sendPartyMessage(
    actor: Actor,
    runId: string,
    toSlot: PartySlot,
    input: PartyMessageInput,
  ): PartyMessage {
    const run = this.requireRun(runId)
    const fromSlot = this.findSlot(run, actor.sessionId)
    assert(fromSlot, 'FORBIDDEN', 'Only current party members can send party messages')
    assert(run.slots[toSlot].currentSessionId, 'UNBOUND_SLOT', `Target slot ${toSlot} is not bound`)
    assert(typeof input.summary === 'string' && input.summary.trim(), 'INVALID_MESSAGE', 'Party message summary is required')
    if (input.kind === 'blocked' || input.kind === 'risk') {
      assert(input.evidence.length > 0, 'MISSING_EVIDENCE', `${input.kind} messages require evidence`)
    }
    const message: PartyMessage = {
      messageId: this.idGenerator(),
      runId,
      fromSlot,
      toSlot,
      kind: input.kind,
      summary: input.summary,
      evidence: clone(input.evidence),
      createdAt: this.clock(),
    }
    this.append(run, 'dungeon/party-message-sent', { message }, actor.sessionId)
    return clone(message)
  }

  getFingerprintIgnoreScopes(): string[] {
    return clone(this.config.fingerprintIgnoreScopes)
  }

  /** Paths the serial submit audit excuses as toolchain byproducts. */
  getSubmitByproductScopes(): string[] {
    return clone(this.config.submitByproductScopes)
  }

  /** Read-only healer verification allowlist for tool-layer preflight checks. */
  getHealerVerificationCommands(): string[] {
    return clone(this.config.healerVerificationCommands)
  }

  /** Read-only healer verification timeout cap for tool-layer preflight checks. */
  getHealerVerificationTimeoutMs(): number {
    return this.config.healerVerificationTimeoutMs
  }

  /** Window in which observed session activity counts as "recently working". */
  getReadinessEvaluationWindowMs(): number {
    return this.config.readinessEvaluationWindowMs
  }

  /**
   * Open a submit protection window for one task: sweeps skip its lease and
   * `submitExecution` tolerates a lease that expires inside the window, so
   * work finished in a long turn is never lost to a concurrent poll-triggered
   * sweep. The window is anchored at the lease expiry (never earlier than
   * now) plus a short grace, so a crashed caller cannot pin a lease forever;
   * callers still release it eagerly in a finally block.
   */
  protectSubmit(runId: string, taskId: string): void {
    const nowMs = Date.parse(this.clock())
    const lease = this.runs.get(runId)?.tasks[taskId]?.activeLease
    const baseMs = Math.max(nowMs, lease ? Date.parse(lease.expiresAt) : nowMs)
    const perRun = this.submitProtections.get(runId) ?? new Map<string, string>()
    perRun.set(taskId, new Date(baseMs + SUBMIT_PROTECTION_GRACE_MS).toISOString())
    this.submitProtections.set(runId, perRun)
  }

  /** Close a submit protection window opened by {@link protectSubmit}. */
  releaseSubmit(runId: string, taskId: string): void {
    const perRun = this.submitProtections.get(runId)
    if (!perRun) return
    perRun.delete(taskId)
    if (perRun.size === 0) this.submitProtections.delete(runId)
  }

  /** Epoch ms until which the task's submit window shields it, if open. */
  private submitProtectedUntil(runId: string, taskId: string, nowMs: number): number | undefined {
    const untilIso = this.submitProtections.get(runId)?.get(taskId)
    if (untilIso === undefined) return undefined
    const untilMs = Date.parse(untilIso)
    if (nowMs > untilMs) {
      this.releaseSubmit(runId, taskId)
      return undefined
    }
    return untilMs
  }

  /** Enumerate in-memory run ids for watchdog sweeps and diagnostics. */
  listRunIds(): string[] {
    return [...this.runs.keys()]
  }

  /** Enumerate only mutable runs without cloning historical terminal state. */
  listActiveRunIds(): string[] {
    const active: string[] = []
    for (const [runId, run] of this.runs) {
      if (!terminalPhases.includes(run.phase)) active.push(runId)
    }
    return active
  }

  getRun(runId: string): DungeonRun {
    return clone(this.requireRun(runId))
  }

  /** Return the minimal immutable data needed by the high-frequency tool guard. */
  getExecutionGuardView(runId: string, slot: DpsSlot): ExecutionGuardView | undefined {
    const run = this.requireRun(runId)
    const task = Object.values(run.tasks).find((candidate) =>
      candidate.ownerSlot === slot && candidate.status === 'running' && candidate.activeLease,
    )
    if (!task) return undefined
    return {
      workspaceRoot: run.workspaceRoot,
      taskId: task.workOrder.id,
      writeScopes: [...task.workOrder.writeScopes],
      globalCommands: [...(task.workOrder.globalCommands ?? [])],
    }
  }

  assertRunAccess(actor: Actor, runId: string): void {
    const run = this.requireRun(runId)
    assert(this.findSlot(run, actor.sessionId), 'FORBIDDEN', 'Only current party members can inspect the run')
  }

  getRunForActor(actor: Actor, runId: string): DungeonRun {
    this.assertRunAccess(actor, runId)
    return clone(this.requireRun(runId))
  }

  private append(run: DungeonRun, type: string, payload: unknown, actorSessionId?: string): DungeonRun {
    const nextSequence = (this.sequenceCounters.get(run.id) ?? 1)
    const event: DungeonEvent = {
      eventId: this.idGenerator(),
      runId: run.id,
      sequence: nextSequence,
      schemaVersion: 1,
      type,
      occurredAt: this.clock(),
      payload,
      ...(actorSessionId ? { actorSessionId } : {}),
    }
    const canonicalEvent = jsonClone(event)
    this.eventStore.append(canonicalEvent)
    const updated = this.reduce(this.runs.get(run.id), canonicalEvent)
    this.runs.set(run.id, updated)
    this.sequenceCounters.set(run.id, nextSequence + 1)
    // The event store owns projection compaction and Session.append snapshots
    // accepted JSON. Passing the live read-only value avoids deep-cloning the
    // whole run for the calls that the store will compact away.
    this.eventStore.publishProjection?.(updated)
    for (const notify of [...(this.waiters.get(run.id) ?? [])]) notify()
    return updated
  }

  private reduce(current: DungeonRun | undefined, event: DungeonEvent): DungeonRun {
    const payload = event.payload as Record<string, any>
    if (event.type === 'dungeon/run-created') {
      const runId = event.runId
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
        verificationRuns: [],
        createdAt: payload.createdAt,
        updatedAt: event.occurredAt,
      }
    }
    assert(current, 'CORRUPT_EVENT_LOG', 'The first event must create the run')
    const run = clone(current)
    run.updatedAt = event.occurredAt
    switch (event.type) {
      case 'dungeon/member-bound': {
        const binding = run.slots[payload.slot as PartySlot]
        binding.currentSessionId = payload.sessionId
        binding.generation = payload.generation
        binding.lifeState = 'alive'
        binding.activityState = 'idle'
        binding.readiness = 'healthy'
        binding.history.push({
          sessionId: payload.sessionId,
          generation: payload.generation,
          boundAt: payload.boundAt,
        })
        break
      }
      case 'dungeon/phase-changed':
        run.phase = payload.phase
        break
      case 'dungeon/member-down': {
        const binding = run.slots[payload.slot as PartySlot]
        binding.lifeState = 'down'
        binding.activityState = 'stopped'
        if (payload.slot === 'tank') {
          binding.readiness = 'unavailable'
          run.commanderLoad = 'unavailable'
          run.controlState = 'paused'
        }
        break
      }
      case 'dungeon/resurrection-requested':
        run.resurrectionRequests.push(payload.request)
        run.battleResChargesRemaining -= 1
        run.slots[payload.request.targetSlot as DpsSlot].lifeState = 'resurrection-requested'
        break
      case 'dungeon/resurrection-started': {
        const request = run.resurrectionRequests.find((item) => item.resurrectionId === payload.resurrectionId)!
        request.status = 'consumed'
        run.slots[request.targetSlot].lifeState = 'resurrecting'
        break
      }
      case 'dungeon/resurrection-completed': {
        const request = run.resurrectionRequests.find((item) => item.resurrectionId === payload.resurrectionId)!
        request.status = 'completed'
        const binding = run.slots[request.targetSlot]
        binding.lifeState = 'alive'
        binding.activityState = 'idle'
        binding.readiness = 'healthy'
        break
      }
      case 'dungeon/member-rebound': {
        const request = run.resurrectionRequests.find((item) => item.resurrectionId === payload.resurrectionId)!
        request.status = 'completed'
        const binding = run.slots[payload.slot as DpsSlot]
        const previous = binding.history.find((entry) => entry.sessionId === payload.previousSessionId && !entry.unboundAt)
        if (previous) {
          previous.unboundAt = payload.completedAt
          previous.endReason = 'replaced-after-failure'
        }
        binding.currentSessionId = payload.sessionId
        binding.generation = payload.generation
        binding.lifeState = 'alive'
        binding.activityState = 'idle'
        binding.readiness = 'healthy'
        binding.history.push({
          sessionId: payload.sessionId,
          generation: payload.generation,
          boundAt: payload.completedAt,
        })
        break
      }
      case 'dungeon/resurrection-failed': {
        const request = run.resurrectionRequests.find((item) => item.resurrectionId === payload.resurrectionId)!
        request.status = 'failed'
        run.slots[request.targetSlot].lifeState = 'down'
        if (!payload.chargeOnFailure) run.battleResChargesRemaining += 1
        break
      }
      case 'dungeon/party-message-sent':
        run.messages.push(payload.message)
        break
      case 'dungeon/member-health-signal-raised':
        run.healthSignals.push(payload.signal)
        break
      case 'dungeon/member-readiness-changed':
        run.slots[payload.slot as PartySlot].readiness = payload.readiness
        if (payload.readiness === 'unavailable' && payload.slot === 'tank') {
          run.commanderLoad = 'unavailable'
          run.controlState = 'paused'
        }
        break
      case 'dungeon/member-recovery-directed':
        run.recoveryInstructions.push(payload.instruction)
        run.slots.healer.readiness = 'recovering'
        break
      case 'dungeon/member-recovery-completed': {
        const instruction = run.recoveryInstructions.find((item) => item.instructionId === payload.instructionId)!
        instruction.status = 'completed'
        instruction.completedAt = payload.completedAt
        run.slots.healer.readiness = 'healthy'
        break
      }
      case 'dungeon/member-recovery-failed': {
        const instruction = run.recoveryInstructions.find((item) => item.instructionId === payload.instructionId)!
        instruction.status = 'failed'
        instruction.completedAt = payload.completedAt
        run.slots.healer.readiness = 'unavailable'
        run.controlState = 'paused'
        break
      }
      case 'dungeon/task-created':
        run.tasks[payload.workOrder.id] = {
          workOrder: payload.workOrder,
          status: 'pending',
          repairRound: 0,
          executionRetries: 0,
          executionReports: [],
        }
        run.taskSetVersion = payload.taskSetVersion
        this.staleReports(run)
        break
      case 'dungeon/task-assigned': {
        const task = run.tasks[payload.taskId]!
        task.ownerSlot = payload.ownerSlot
        task.status = 'ready'
        break
      }
      case 'dungeon/task-lease-granted': {
        const task = run.tasks[payload.taskId]!
        task.activeLease = payload.lease
        task.status = 'running'
        task.progressState = 'on-track'
        task.missedCheckpoints = 0
        task.nextCheckpointDueAt = payload.nextCheckpointDueAt
        run.slots[payload.lease.ownerSlot as DpsSlot].activityState = 'running'
        break
      }
      case 'dungeon/verification-command-run':
        run.verificationRuns.push(payload as VerificationCommandRun)
        break
      case 'dungeon/task-submitted': {
        const report = payload.report as ExecutionReport
        const task = run.tasks[report.taskId]!
        task.executionReports.push(report)
        task.status = report.status
        task.progressState = 'on-track'
        task.missedCheckpoints = 0
        const checkpointRequest = run.checkpointRequests.find((request) =>
          request.taskId === report.taskId &&
          request.leaseId === report.leaseId &&
          request.leaseVersion === report.leaseVersion &&
          request.status === 'issued',
        )
        if (checkpointRequest) {
          checkpointRequest.status = 'completed'
          checkpointRequest.completedAt = event.occurredAt
        }
        delete task.activeLease
        // Close the slot activity again: a member that handed in work is idle
        // until it claims another lease.
        run.slots[report.slot as DpsSlot].activityState = 'idle'
        break
      }
      case 'dungeon/task-turn-registered':
        run.tasks[payload.taskId]!.currentTurnId = payload.turnId
        break
      case 'dungeon/task-interrupt-requested':
        run.tasks[payload.taskId]!.interruptState = 'requested'
        break
      case 'dungeon/task-interrupt-completed': {
        const task = run.tasks[payload.taskId]!
        task.interruptState = 'completed'
        task.quarantinedFiles = payload.quarantinedFiles
        task.quarantineReviewed = payload.quarantinedFiles.length === 0
        break
      }
      case 'dungeon/task-interrupt-failed':
        run.tasks[payload.taskId]!.interruptState = 'failed'
        break
      case 'dungeon/task-lease-revoked': {
        const task = run.tasks[payload.taskId]!
        delete task.activeLease
        task.status = 'ready'
        // Lease expiry returns the task to the schedulable pool so any free
        // DPS may claim it. Other revocation reasons (member-down,
        // turn-interrupted) keep the owner so battle resurrection and
        // reassignment keep their target.
        if (payload.reason === 'lease-expired') delete task.ownerSlot
        if (task.ownerSlot) {
          const ownerBinding = run.slots[task.ownerSlot]
          // A down member keeps its stopped activity; alive owners go idle.
          if (ownerBinding.lifeState === 'alive') ownerBinding.activityState = 'idle'
        }
        break
      }
      case 'dungeon/workspace-changes-quarantined': {
        const task = run.tasks[payload.taskId]!
        task.quarantinedFiles = payload.files
        task.quarantineReviewed = false
        break
      }
      case 'dungeon/workspace-quarantine-reviewed':
        run.tasks[payload.taskId]!.quarantineReviewed = true
        break
      case 'dungeon/task-owner-reassigned': {
        const task = run.tasks[payload.taskId]!
        task.ownerSlot = payload.ownerSlot
        task.status = 'ready'
        task.progressState = 'on-track'
        task.missedCheckpoints = 0
        delete task.currentTurnId
        break
      }
      case 'dungeon/task-stall-suspected':
      case 'dungeon/task-stall-confirmed': {
        const task = run.tasks[payload.taskId]!
        task.progressState = payload.progressState
        task.missedCheckpoints = payload.missedCheckpoints
        task.nextCheckpointDueAt = payload.nextCheckpointDueAt
        break
      }
      case 'dungeon/checkpoint-requested':
        run.checkpointRequests.push(payload.request)
        break
      case 'dungeon/checkpoint-request-expired': {
        const request = run.checkpointRequests.find((item) => item.requestId === payload.requestId)
        if (request) request.status = 'expired'
        break
      }
      case 'dungeon/checkpoint-submitted': {
        const checkpoint = payload.checkpoint as DpsCheckpoint
        const task = run.tasks[checkpoint.taskId]!
        task.lastCheckpoint = checkpoint
        task.activeLease = payload.renewedLease
        task.progressState = 'on-track'
        task.missedCheckpoints = 0
        task.nextCheckpointDueAt = payload.nextCheckpointDueAt
        const request = run.checkpointRequests.find((item) =>
          item.taskId === checkpoint.taskId &&
          item.leaseId === checkpoint.leaseId &&
          item.leaseVersion === checkpoint.leaseVersion &&
          item.status === 'issued',
        )
        if (request) {
          request.status = 'completed'
          request.completedAt = checkpoint.observedAt ?? event.occurredAt
        }
        break
      }
      case 'dungeon/task-reopened': {
        const task = run.tasks[payload.taskId]!
        task.workOrder.version = payload.taskVersion
        task.repairRound = payload.repairRound
        task.status = 'pending'
        delete task.activeLease
        delete task.ownerSlot
        run.taskSetVersion = payload.taskSetVersion
        this.staleReports(run)
        break
      }
      case 'dungeon/task-retried': {
        const task = run.tasks[payload.taskId]!
        task.workOrder.version = payload.taskVersion
        task.executionRetries = payload.executionRetries
        task.status = 'pending'
        task.progressState = 'on-track'
        task.missedCheckpoints = 0
        delete task.activeLease
        delete task.ownerSlot
        run.taskSetVersion = payload.taskSetVersion
        this.staleReports(run)
        break
      }
      case 'dungeon/workspace-fingerprint-observed':
        run.workspaceFingerprint = payload.workspaceFingerprint
        this.staleReports(run)
        break
      case 'dungeon/commander-load-changed':
        run.commanderLoad = payload.commanderLoad
        break
      case 'dungeon/dispatch-throttled':
        run.controlState = 'throttled'
        break
      case 'dungeon/dispatch-paused':
        run.controlState = 'paused'
        break
      case 'dungeon/commander-returned': {
        const ticket = payload.ticketId
          ? run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId)
          : undefined
        if (ticket) ticket.status = 'completed'
        if (payload.refundCharge) run.commanderBattleResChargesRemaining += 1
        // The commander's own state always recovers here, but a run frozen by
        // an unavailable healer stays paused (PRD §10.3) until the healer is
        // healthy again and dispatch is explicitly resumed.
        run.controlState = run.slots.healer.readiness === 'unavailable' ? 'paused' : 'normal'
        run.commanderLoad = 'normal'
        run.slots.tank.lifeState = 'alive'
        run.slots.tank.readiness = 'healthy'
        break
      }
      case 'dungeon/dispatch-resumed':
        run.controlState = 'normal'
        run.commanderLoad = 'normal'
        run.slots.tank.lifeState = 'alive'
        run.slots.tank.readiness = 'healthy'
        break
      case 'dungeon/commander-checkpointed':
        run.commanderCheckpoint = payload.checkpoint
        break
      case 'dungeon/commander-rescue-ticket-issued':
        run.commanderRescueTickets.push(payload.ticket)
        run.commanderBattleResChargesRemaining -= 1
        break
      case 'dungeon/commander-rescue-ticket-consumed': {
        const ticket = run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId)!
        ticket.status = 'consumed'
        ticket.recoveryExpiresAt = payload.recoveryExpiresAt
        run.controlState = 'recovering'
        break
      }
      case 'dungeon/commander-rescue-ticket-expired': {
        const ticket = run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId)!
        ticket.status = 'expired'
        run.commanderBattleResChargesRemaining += 1
        break
      }
      case 'dungeon/commander-resurrection-completed': {
        const ticket = run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId)!
        ticket.status = 'completed'
        run.slots.tank.lifeState = 'alive'
        run.slots.tank.readiness = 'recovering'
        run.commanderLoad = 'pressured'
        run.controlState = 'recovering'
        break
      }
      case 'dungeon/commander-resurrection-failed': {
        const ticket = run.commanderRescueTickets.find((item) => item.ticketId === payload.ticketId)!
        ticket.status = 'failed'
        run.controlState = 'paused'
        break
      }
      case 'dungeon/validation-manifest-created':
        run.manifests.push(payload.manifest)
        run.workspaceFingerprint = payload.manifest.workspaceFingerprint
        this.staleReports(run)
        break
      case 'dungeon/validation-submitted':
        // PRD §9.3: submitting a report never invalidates prior reports by
        // itself; only task-set, manifest, or fingerprint changes do.
        run.validationReports.push(payload.report)
        break
      case 'dungeon/run-completion-prepared':
        break
      case 'dungeon/run-completion-aborted':
        // The workspace changed between validation and completion, so every
        // existing acceptance report no longer describes the workspace.
        this.staleReports(run)
        break
      case 'dungeon/run-completed':
        run.phase = 'COMPLETED'
        run.resultSummary = payload.resultSummary
        break
      case 'dungeon/run-failed':
        run.phase = 'FAILED'
        break
    }
    return run
  }

  private buildCommanderCheckpoint(run: DungeonRun, pendingDecisionIds: string[]): CommanderCheckpoint {
    return {
      checkpointId: this.idGenerator(),
      runId: run.id,
      phase: run.phase,
      controlState: run.controlState,
      taskSetVersion: run.taskSetVersion,
      pendingDecisionIds: clone(pendingDecisionIds),
      activeLeaseIds: Object.values(run.tasks).flatMap((task) => task.activeLease ? [task.activeLease.leaseId] : []),
      memberReadiness: Object.fromEntries(
        slots.flatMap((slot) => run.slots[slot].readiness ? [[slot, run.slots[slot].readiness]] : []),
      ),
      workspaceFingerprint: run.workspaceFingerprint,
      createdAt: this.clock(),
    }
  }

  private staleReports(run: DungeonRun): void {
    for (const report of run.validationReports) report.status = 'stale'
  }

  private requireRun(runId: string): DungeonRun {
    const existing = this.runs.get(runId)
    if (existing) return existing
    const events = this.eventStore.load(runId)
    assert(events.length > 0, 'RUN_NOT_FOUND', `Run ${runId} was not found`)
    this.recoverRun(runId)
    return this.runs.get(runId)!
  }

  private requireTank(actor: Actor, runId: string): DungeonRun {
    const run = this.requireRun(runId)
    assert(run.slots.tank.currentSessionId === actor.sessionId, 'FORBIDDEN', 'Only the bound tank can perform this operation')
    return run
  }

  private requireDps(run: DungeonRun, sessionId: string): DpsSlot {
    const slot = this.findSlot(run, sessionId)
    assert(slot && dpsSlots.includes(slot as DpsSlot), 'FORBIDDEN', 'Only a bound DPS can perform this operation')
    return slot as DpsSlot
  }

  private findSlot(run: DungeonRun, sessionId: string): PartySlot | undefined {
    return slots.find((slot) => run.slots[slot].currentSessionId === sessionId)
  }

  private requireTask(run: DungeonRun, taskId: string): TaskRecord {
    const task = run.tasks[taskId]
    assert(task, 'TASK_NOT_FOUND', `Task ${taskId} was not found`)
    return task
  }

  private assertMutable(run: DungeonRun): void {
    assert(!terminalPhases.includes(run.phase), 'RUN_TERMINAL', `Run is already ${run.phase}`)
  }

  private assertRequiredTasksComplete(run: DungeonRun): void {
    const incomplete = Object.values(run.tasks).filter((task) => task.workOrder.required && task.status !== 'completed')
    assert(incomplete.length === 0, 'INCOMPLETE_TASKS', `Required tasks are incomplete: ${incomplete.map((task) => task.workOrder.id).join(', ')}`)
  }
}
