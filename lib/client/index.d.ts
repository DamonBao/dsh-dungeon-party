import * as react_jsx_runtime0 from "react/jsx-runtime";
import { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

//#region src/service/dungeon-service.d.ts
type PartySlot = 'tank' | 'dps-1' | 'dps-2' | 'dps-3' | 'healer';
type DpsSlot = Extract<PartySlot, `dps-${number}`>;
type RunPhase = 'FORMING' | 'PLANNING' | 'PLAN_REVIEW' | 'EXECUTING' | 'VALIDATING' | 'REPAIR' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type RunControlState = 'normal' | 'throttled' | 'paused' | 'recovering';
type MemberReadiness = 'healthy' | 'degraded' | 'recovering' | 'unavailable';
type MemberLifeState = 'alive' | 'down' | 'resurrection-requested' | 'resurrecting' | 'permanently-dead';
type MemberActivityState = 'idle' | 'queued' | 'running' | 'waiting' | 'stopped';
type TaskProgressState = 'on-track' | 'suspected-stalled' | 'stalled';
type CommanderLoadState = 'normal' | 'pressured' | 'overloaded' | 'unavailable';
type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'blocked' | 'failed' | 'scope-violation';
interface AcceptanceCriterion {
  id: string;
  description: string;
  required: boolean;
}
interface WorkOrder {
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
interface TaskLease {
  leaseId: string;
  ownerSlot: DpsSlot;
  grantedAt: string;
  expiresAt: string;
  version: number;
}
interface ExecutionReport {
  taskId: string;
  taskVersion: number;
  leaseId: string;
  leaseVersion: number;
  slot: DpsSlot;
  generation: number;
  status: 'completed' | 'blocked' | 'failed';
  summary: string;
  changedFiles: string[];
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
interface DpsCheckpoint {
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
interface CheckpointRequest {
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
interface TaskRecord {
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
  executionReports: ExecutionReport[];
}
interface SlotBinding {
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
interface ValidationManifest {
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
interface ValidationCheck {
  criterionId: string;
  status: 'pass' | 'fail' | 'blocked' | 'not-applicable';
  evidence: string[];
  notApplicableReason?: string;
}
interface ValidationFinding {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  ownerTaskId?: string;
  title: string;
  evidence: string;
  remediation: string;
}
interface ValidationReport {
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
interface HealthSignal {
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
interface PartyMessage {
  messageId: string;
  runId: string;
  fromSlot: PartySlot;
  toSlot: PartySlot;
  kind: 'progress' | 'blocked' | 'risk' | 'question' | 'decision' | 'notice';
  summary: string;
  evidence: string[];
  createdAt: string;
}
interface RecoveryInstruction {
  instructionId: string;
  runId: string;
  slot: 'healer';
  action: 'validator-maintenance';
  status: 'issued' | 'completed' | 'failed';
  issuedAt: string;
  expiresAt: string;
  completedAt?: string;
}
interface ResurrectionRequest {
  resurrectionId: string;
  runId: string;
  targetSlot: DpsSlot;
  targetSessionId: string;
  status: 'issued' | 'consumed' | 'completed' | 'failed';
  requestedAt: string;
  expiresAt: string;
}
interface CommanderRescueTicket {
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
interface CommanderCheckpoint {
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
interface DungeonRun {
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
  resultSummary?: string;
  createdAt: string;
  updatedAt: string;
}
type ScopeEnforcementMode = 'auto' | 'telemetry' | 'aggregate' | 'serial';
type EffectiveScopeEnforcementMode = Exclude<ScopeEnforcementMode, 'auto'>;
//#endregion
//#region client/index.d.ts
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    'dungeon-party': DungeonRun | null;
  }
}
interface MemberMeters {
  health: number;
  resource: number;
  resourceName: string;
  activityLabel: string;
}
/** Convert durable service state into role-specific, human-readable meters. */
declare function memberMeters(run: DungeonRun, slot: PartySlot): MemberMeters;
interface DungeonPartyOverlayProps extends PropsRuntime<'shell.overlay'> {
  requestAction: (instruction: string) => Promise<boolean>;
}
declare function DungeonPartyOverlay({
  useSessions,
  requestAction
}: DungeonPartyOverlayProps): react_jsx_runtime0.JSX.Element | null;
declare const inject: string[];
declare function apply(ctx: ClientContext): void;
//#endregion
export { DungeonPartyOverlay, MemberMeters, apply, inject, memberMeters };