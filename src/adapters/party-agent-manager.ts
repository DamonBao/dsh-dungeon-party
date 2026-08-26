import type { Context } from '@deepseek-ai/cordis'
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, matchesGlob, relative, resolve } from 'node:path'
import type { Agent, AgentHandle, AgentRegistry } from '@deepseek-ai/dsh-agent'
import type { AgentPresets } from '@deepseek-ai/dsh-agent-presets'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import type { SessionId } from '@deepseek-ai/dsh-session'

import {
  DungeonError,
  type Actor,
  type CheckpointRequest,
  type CommanderRescueTicket,
  type DungeonRun,
  type DungeonService,
  type DpsSlot,
  type ExecutionReport,
  type PartyMessage,
  type PartyMessageInput,
  type PartySlot,
  type RecoveryInstruction,
  type ResurrectionRequest,
  type RunPhase,
  type TaskLease,
  type TaskRecord,
} from '../service/dungeon-service.js'
import {
  diffWorkspaceSnapshots,
  type WorkspaceSnapshot,
} from './workspace-fingerprint.js'
import { workspaceComputationQueue } from './workspace-computation-queue.js'

type ChildSlot = Exclude<PartySlot, 'tank'>

const roleTools: Record<ChildSlot, string[]> = {
  'dps-1': ['party_status', 'party_wait', 'party_health', 'work_claim', 'work_submit', 'member_checkpoint', 'party_message', 'read', 'write', 'edit', 'glob', 'grep', 'bash'],
  'dps-2': ['party_status', 'party_wait', 'party_health', 'work_claim', 'work_submit', 'member_checkpoint', 'party_message', 'read', 'write', 'edit', 'glob', 'grep', 'bash'],
  'dps-3': ['party_status', 'party_wait', 'party_health', 'work_claim', 'work_submit', 'member_checkpoint', 'party_message', 'read', 'write', 'edit', 'glob', 'grep', 'bash'],
  healer: ['party_status', 'party_wait', 'party_health', 'validation_manifest', 'validation_submit', 'verification_run', 'member_self_maintain', 'battle_res', 'party_message', 'read', 'glob', 'grep'],
}

const rolePersonas: Record<ChildSlot, string> = {
  'dps-1': 'You are Pyra the Flameblade, the party’s Flame Engineer Executor (DPS-1). Execute only your structured work order and active lease. Re-read files before editing, stay inside writeScopes, submit evidence and checkpoints, and never claim the whole run is complete.',
  'dps-2': 'You are Nyx the Shadowstrider, the party’s Shadow Scout Executor (DPS-2). Execute only your structured work order and active lease. Re-read files before editing, stay inside writeScopes, submit evidence and checkpoints, and never claim the whole run is complete.',
  'dps-3': 'You are Aster the Starweaver, the party’s Arcane Architect Executor (DPS-3). Execute only your structured work order and active lease. Re-read files before editing, stay inside writeScopes, submit evidence and checkpoints, and never claim the whole run is complete.',
  healer: 'You are Lumina the Oracle, the independent Holy Adjudicator Validator (Healer). Inspect the current manifest and evidence, submit a complete validation report, and perform only authorized maintenance or resurrection. Do not modify implementation files or impersonate the Commander.',
}

/**
 * Short persona names used for durable agent identity (subagent descriptor
 * labels). Keep in sync with `rolePersonas` and the client's `partyIdentity`.
 */
export const rolePersonaNames: Record<ChildSlot, string> = {
  'dps-1': 'Pyra',
  'dps-2': 'Nyx',
  'dps-3': 'Aster',
  healer: 'Lumina',
}

export class PartyAgentManager {
  private readonly handles = new Map<string, AgentHandle>()
  private readonly commanderHandles = new Map<string, AgentHandle>()
  private readonly dispatchedRecoveryIds = new Set<string>()
  /**
   * Per-task workspace audit state. `snapshot` is the rolling baseline and
   * `accumulated` keeps every change observed across checkpoint re-baselines,
   * so a checkpoint can never silently absorb pre-existing (or out-of-scope)
   * modifications before the final submit audit.
   */
  private readonly leaseAudits = new Map<string, { leaseId: string; snapshot: WorkspaceSnapshot; accumulated: Set<string> }>()
  private readonly pending = new Map<string, Promise<string>>()
  /** Serializes dispatch per run so concurrent kicks cannot double-assign. */
  private readonly dispatchLocks = new Map<string, Promise<unknown>>()
  /** Serializes lease baselines and submit audits per run. */
  private readonly workspaceAuditLocks = new Map<string, Promise<unknown>>()
  /** Rate-limits dangling-lease turn-end nudges per session. */
  private readonly turnEndNudges = new Map<string, number>()
  /** Rate-limits redispatch of assigned-but-unclaimed tasks per run/task. */
  private readonly redispatchAt = new Map<string, number>()
  /** Last taskSetVersion per run for which a drained-execution notice fired. */
  private readonly drainNoticeTaskSetVersions = new Map<string, number>()
  /** Agent contexts that already carry the execution guard listener. */
  private readonly guardedContexts = new WeakSet<Context>()
  /**
   * Current run/slot binding per guarded context. The installed listener reads
   * this live so a context reused across runs never keeps a stale guard.
   */
  private readonly guardBindings = new WeakMap<Context, { runId: string; slot: DpsSlot }>()
  /** Unexpected scheduler errors, kept for diagnostics instead of failing post-commit flows. */
  readonly schedulerErrors: unknown[] = []
  /**
   * Last observed activity (epoch ms) per session, fed from host session
   * events. The watchdog treats a recently active owner as working, so a long
   * turn can never be mistaken for a stall while it still emits events.
   */
  private readonly sessionActivity = new Map<string, number>()

  constructor(
    private readonly service: DungeonService,
    private readonly agents: AgentRegistry,
    private readonly presets: AgentPresets,
    private readonly childRoute: { provider?: string; model?: string } = {},
    private readonly clockMs: () => number = Date.now,
  ) {}

  /** Record a host-observed activity signal for one session. */
  observeSessionActivity(sessionId: string, atMs: number = this.clockMs()): void {
    this.sessionActivity.set(sessionId, atMs)
  }

  /** Epoch ms of the latest observed activity for one session, if any. */
  lastActivityAt(sessionId: string): number | undefined {
    return this.sessionActivity.get(sessionId)
  }

  private recentlyActive(sessionId: string | undefined): boolean {
    if (!sessionId) return false
    const last = this.sessionActivity.get(sessionId)
    if (last === undefined) return false
    return this.clockMs() - last <= this.service.getReadinessEvaluationWindowMs()
  }

  /**
   * Child agent model route: explicit childRoute config wins over the tank's
   * creation-time options (the tank's live UI-side model selection is not
   * exposed on the rc8 Agent API and cannot be inherited automatically).
   */
  private childAgentOptions(tankAgent: Agent): { provider?: string; model?: string; maxTokens?: number } {
    return { ...tankAgent.options, ...this.childRoute }
  }

  async restoreBoundParty(actor: Actor, runId: string): Promise<void> {
    const run = this.service.getRunForActor(actor, runId)
    for (const slot of ['dps-1', 'dps-2', 'dps-3', 'healer'] as const) {
      if (run.slots[slot].currentSessionId) await this.ensureMember(actor, runId, slot)
    }
    // Recovered leases lost their in-memory audit baselines on restart;
    // rebuild them so in-flight tasks can submit again.
    await this.rebuildMissingLeaseAudits(runId).catch(() => undefined)
  }

  async prepareForPhase(actor: Actor, runId: string, phase: RunPhase): Promise<void> {
    if (phase === 'EXECUTING') {
      await this.ensureMember(actor, runId, 'healer')
      return
    }
    if (phase !== 'VALIDATING') return
    await this.ensureMember(actor, runId, 'healer')
    const handle = this.handles.get(keyFor(runId, 'healer'))
    if (!handle) throw new DungeonError('HEALER_AGENT_UNAVAILABLE', 'The healer Agent is not live')
    handle.agent.send(createUserMessage({
      content: [{
        type: 'text',
        text: `Run ${runId} entered validation. Call validation_manifest to obtain the host-fingerprinted immutable criteria, inspect evidence independently, then submit one complete validation_submit report.`,
      }],
      source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
    }), 'next-turn', true)
  }

  async kickScheduler(runId: string): Promise<string[]> {
    const run = this.service.getRun(runId)
    const tankSessionId = run.slots.tank.currentSessionId
    if (!tankSessionId) return []
    try {
      return await this.dispatchAvailableTasks({ sessionId: tankSessionId }, runId)
    } catch (error) {
      // Scheduling is best-effort after a committed state transition; expected
      // domain refusals are safe to swallow. Unexpected failures are recorded
      // so they surface in diagnostics instead of vanishing.
      if (!(error instanceof DungeonError)) this.schedulerErrors.push(error)
      return []
    }
  }

  async dispatchAvailableTasks(actor: Actor, runId: string): Promise<string[]> {
    return this.withDispatchLock(runId, () => this.dispatchAvailableTasksUnlocked(actor, runId))
  }

  /**
   * Periodic watchdog: revokes expired leases (notifying the owner and
   * redispatching the task), and escalates stalled progress from a checkpoint
   * nudge to a tank alert using the service's own clock.
   */
  async runWatchdog(): Promise<void> {
    for (const runId of this.service.listActiveRunIds()) {
      let run: DungeonRun
      try {
        run = this.service.getRun(runId)
      } catch {
        continue
      }
      if (run.phase !== 'EXECUTING' && run.phase !== 'REPAIR') continue
      const tankSessionId = run.slots.tank.currentSessionId
      if (!tankSessionId) continue
      const tankActor: Actor = { sessionId: tankSessionId }

      const heldLeases = Object.values(run.tasks)
        .filter((task) => task.activeLease && task.ownerSlot)
        .map((task) => ({ taskId: task.workOrder.id, slot: task.ownerSlot!, leaseId: task.activeLease!.leaseId }))
      this.service.sweepExpiredState(runId)
      const swept = this.service.getRun(runId)
      const revoked = heldLeases.filter(({ taskId, leaseId }) => {
        const task = swept.tasks[taskId]
        return !task?.activeLease || task.activeLease.leaseId !== leaseId
      })
      for (const { taskId, slot, leaseId } of revoked) {
        this.handles.get(keyFor(runId, slot))?.agent.send(createUserMessage({
          content: [{
            type: 'text',
            text: `Your lease ${leaseId} for task ${taskId} expired and was revoked; the task returned to the schedulable pool and will be redispatched. Do not continue edits on it.`,
          }],
          source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
        }), 'next-step', true)
      }
      if (revoked.length > 0) {
        await this.dispatchAvailableTasks(tankActor, runId).catch(() => undefined)
        continue
      }

      // After a host restart, in-memory lease audit baselines are gone while
      // leases recovered from the event log are still active. Re-baseline so
      // those tasks can submit again; changes made from this point onward
      // stay fully audited.
      const missingAudit = Object.values(swept.tasks).some((task) =>
        task.activeLease && task.ownerSlot && !this.leaseAudits.has(`${runId}:${task.workOrder.id}`),
      )
      if (missingAudit) await this.rebuildMissingLeaseAudits(runId).catch(() => undefined)

      // Assigned but never (or no longer) dispatched work is invisible to
      // the ordinary scheduler pass, which only sees ownerless tasks.
      // Redispatch to the owner at most once every five minutes per task.
      for (const task of Object.values(swept.tasks)) {
        if (task.status !== 'ready' || !task.ownerSlot || task.activeLease) continue
        const ownerBinding = swept.slots[task.ownerSlot]
        if (!ownerBinding.currentSessionId || ownerBinding.lifeState !== 'alive') continue
        const redispatchKey = `${runId}:${task.workOrder.id}`
        const nowMs = this.clockMs()
        if (nowMs < (this.redispatchAt.get(redispatchKey) ?? 0)) continue
        this.redispatchAt.set(redispatchKey, nowMs + 5 * 60_000)
        try {
          this.dispatchTask(tankActor, runId, task.workOrder.id)
        } catch {
          // The owner agent may not be live yet; the next pass retries.
        }
      }

      for (const task of Object.values(swept.tasks)) {
        if (task.status !== 'running' || !task.activeLease || !task.ownerSlot) continue
        const before = task.progressState
        // A recently active owner session is working, not stalled: long turns
        // legitimately cannot emit member_checkpoint mid-turn.
        this.service.evaluateTaskProgress(runId, task.workOrder.id, {
          hasRecentActivity: this.recentlyActive(swept.slots[task.ownerSlot].currentSessionId),
        })
        const after = this.service.getRun(runId).tasks[task.workOrder.id]
        if (!after || after.progressState === before) continue
        if (after.progressState === 'suspected-stalled') {
          try {
            this.requestCheckpoint(tankActor, runId, task.workOrder.id)
          } catch {
            // The DPS agent may not be live; the next watchdog pass retries.
          }
        } else if (after.progressState === 'stalled') {
          const turnHint = after.currentTurnId
            ? ` The exact active turn is ${after.currentTurnId}; party_interrupt requires this turnId verbatim.`
            : ' The active turn id is unknown; call party_status to read currentTurnId before party_interrupt.'
          this.agents.get(tankSessionId as SessionId)?.send(createUserMessage({
            content: [{
              type: 'text',
              text: `Task stall confirmed for ${task.workOrder.id} on ${task.ownerSlot}: ${after.missedCheckpoints ?? 0} missed checkpoints.${turnHint} Use party_request_checkpoint for evidence, or party_interrupt once the task is confirmed stalled.`,
            }],
            source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
          }), 'next-step', true)
        }
      }
    }
  }

  /**
   * Nudge a DPS whose turn ended while it still holds an active lease,
   * rate-limited to one nudge per session per minute.
   */
  nudgeAfterTurnEnd(sessionId: string): void {
    const now = this.clockMs()
    const last = this.turnEndNudges.get(sessionId)
    if (last !== undefined && now - last < 60_000) return
    for (const runId of this.service.listActiveRunIds()) {
      let run: DungeonRun
      try {
        run = this.service.getRun(runId)
      } catch {
        continue
      }
      const slot = run.phase === 'EXECUTING' || run.phase === 'REPAIR'
        ? (['dps-1', 'dps-2', 'dps-3'] as const).find((candidate) => run.slots[candidate].currentSessionId === sessionId)
        : undefined
      if (!slot) continue
      const task = Object.values(run.tasks).find((candidate) =>
        candidate.ownerSlot === slot && candidate.status === 'running' && candidate.activeLease,
      )
      if (!task) continue
      this.turnEndNudges.set(sessionId, now)
      this.handles.get(keyFor(runId, slot))?.agent.send(createUserMessage({
        content: [{
          type: 'text',
          text: `Your turn ended while task ${task.workOrder.id} still holds an active lease. Call member_checkpoint with progress evidence, or work_submit when finished, before starting unrelated work.`,
        }],
        source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
      }), 'next-step', true)
      return
    }
  }

  /**
   * Serial scope mode can carry exactly one claimable write task at a time.
   * A write task is blocked while another write task holds an active lease
   * or is already assigned and awaiting its claim; read-only tasks are never
   * blocked. Reads live run state because earlier loop iterations may have
   * assigned tasks since the caller's snapshot.
   */
  private serialWriteBlocked(runId: string, task: TaskRecord): boolean {
    const run = this.service.getRun(runId)
    if (run.scopeEnforcementMode !== 'serial') return false
    if (task.workOrder.writeScopes.length === 0) return false
    return Object.values(run.tasks).some((other) =>
      other.workOrder.id !== task.workOrder.id &&
      other.workOrder.writeScopes.length > 0 &&
      (other.activeLease !== undefined || (other.status === 'ready' && other.ownerSlot !== undefined)),
    )
  }

  private async withDispatchLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.dispatchLocks.get(runId) ?? Promise.resolve()
    const chained = previous.catch(() => undefined).then(operation)
    this.dispatchLocks.set(runId, chained)
    try {
      return await chained
    } finally {
      if (this.dispatchLocks.get(runId) === chained) this.dispatchLocks.delete(runId)
    }
  }

  private async withWorkspaceAuditLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.workspaceAuditLocks.get(runId) ?? Promise.resolve()
    const chained = previous.catch(() => undefined).then(operation)
    this.workspaceAuditLocks.set(runId, chained)
    try {
      return await chained
    } finally {
      if (this.workspaceAuditLocks.get(runId) === chained) this.workspaceAuditLocks.delete(runId)
    }
  }

  private async dispatchAvailableTasksUnlocked(actor: Actor, runId: string): Promise<string[]> {
    const assigned: string[] = []
    const run = this.service.getRunForActor(actor, runId)
    if (run.phase !== 'EXECUTING' && run.phase !== 'REPAIR') return assigned
    // A slot is busy as soon as it owns a ready (assigned but unclaimed) OR
    // running task; counting only running lets a second kick double-assign a
    // DPS whose first claim is still pending.
    const busySlots = new Set(Object.values(run.tasks)
      .filter((task) => task.ownerSlot && (task.status === 'ready' || task.status === 'running'))
      .map((task) => task.ownerSlot))
    const freeSlots = (['dps-1', 'dps-2', 'dps-3'] as const).filter((slot) => {
      if (busySlots.has(slot)) return false
      const binding = run.slots[slot]
      // A bound-but-down slot must be recovered, not handed new work; unbound
      // slots stay eligible so the scheduler can create members for them.
      if (!binding.currentSessionId) return true
      return binding.lifeState === 'alive'
    })
    const priority = { critical: 0, high: 1, normal: 2, low: 3 } as const
    const readyTasks = Object.values(run.tasks)
      .filter((task) => ['pending', 'ready'].includes(task.status) && !task.ownerSlot)
      .sort((left, right) => priority[left.workOrder.priority] - priority[right.workOrder.priority])

    for (const task of readyTasks) {
      // Serial scope mode can carry exactly one claimable write task at a
      // time. Dispatching more only creates claim contention (rejected
      // work_claim retries), so queued write tasks wait for the active lease.
      if (this.serialWriteBlocked(runId, task)) continue
      const slot = freeSlots.shift()
      if (!slot) break
      try {
        this.service.preflightTaskAssignment(actor, runId, task.workOrder.id, slot)
        await this.ensureMember(actor, runId, slot)
        this.service.assignTask(actor, runId, task.workOrder.id, slot)
        this.dispatchTask(actor, runId, task.workOrder.id)
        assigned.push(task.workOrder.id)
      } catch (error) {
        if (error instanceof DungeonError) {
          // Expected domain refusals (unmet dependency, slot busy, member not
          // live, agent unavailable, …) must not abort the whole dispatch
          // pass: record them for diagnostics and continue with other tasks.
          this.schedulerErrors.push(error)
          freeSlots.unshift(slot)
          continue
        }
        throw error
      }
    }
    this.notifyDrainedExecution(runId)
    return assigned
  }

  /**
   * Orchestration loop closure: when a dispatch pass ends with the run fully
   * drained (EXECUTING/REPAIR, no pending/ready/running task, no active
   * lease, no in-flight recovery, and every required task completed), nudge
   * the tank Agent to call party_health and move the party toward
   * VALIDATING. The notice never mutates run state and is deduplicated per
   * runId+taskSetVersion so repeated kicks stay quiet until the task set
   * changes. Strictly best-effort: it must never break the scheduler.
   */
  private notifyDrainedExecution(runId: string): void {
    try {
      const run = this.service.getRun(runId)
      if (run.phase !== 'EXECUTING' && run.phase !== 'REPAIR') return
      if (this.drainNoticeTaskSetVersions.get(runId) === run.taskSetVersion) return
      const tasks = Object.values(run.tasks)
      if (tasks.length === 0) return
      // Open work still exists: undispatched tasks (including ones parked on
      // unmet dependencies) or any dangling lease keeps the run busy.
      const hasOpenWork = tasks.some((task) =>
        task.status === 'pending' || task.status === 'ready' || task.status === 'running' || task.activeLease,
      )
      if (hasOpenWork) return
      // Optional tasks reported blocked/failed do not gate VALIDATING, so
      // only incomplete required tasks hold the notice back.
      if (tasks.some((task) => task.workOrder.required && task.status !== 'completed')) return
      const recoveryInFlight =
        run.resurrectionRequests.some((request) => request.status === 'issued' || request.status === 'consumed') ||
        run.commanderRescueTickets.some((ticket) => ticket.status === 'issued' || ticket.status === 'consumed') ||
        run.recoveryInstructions.some((instruction) => instruction.status === 'issued')
      if (recoveryInFlight) return
      const tankSessionId = run.slots.tank.currentSessionId
      if (!tankSessionId) return
      const tankAgent = this.agents.get(tankSessionId as SessionId)
      if (!tankAgent) return
      const text = run.phase === 'REPAIR'
        ? `Run ${runId} repair dispatch is drained (taskSetVersion ${run.taskSetVersion}): every required task is completed and nothing is pending, ready, running, leased, or under recovery. Call party_health to confirm party state, then judge whether the repaired workspace warrants re-acceptance via party_phase VALIDATING or further repair planning. A drained repair queue is not completion by itself; this notice does not change any run state.`
        : `Run ${runId} execution dispatch is drained (taskSetVersion ${run.taskSetVersion}): every required task is completed and nothing is pending, ready, running, leased, or under recovery. Call party_health to confirm party state, then open acceptance with party_phase VALIDATING so the healer can validate the current workspace independently. This notice does not change any run state.`
      tankAgent.send(createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
      }), 'next-step', true)
      this.drainNoticeTaskSetVersions.set(runId, run.taskSetVersion)
    } catch {
      // Best-effort only: drain noticing must never throw into kickScheduler.
    }
  }

  async executeValidatorMaintenance(actor: Actor, runId: string): Promise<RecoveryInstruction> {
    const instruction = this.service.directValidatorMaintenance(actor, runId)
    const run = this.service.getRun(runId)
    const healerSessionId = run.slots.healer.currentSessionId!
    const healer = this.handles.get(keyFor(runId, 'healer'))?.agent ??
      this.agents.get(healerSessionId as SessionId)
    if (!healer) {
      this.service.completeValidatorMaintenance(
        { sessionId: healerSessionId }, runId, instruction.instructionId, false,
      )
      throw new DungeonError('HEALER_AGENT_UNAVAILABLE', 'The healer Agent is not live')
    }
    try {
      healer.cancel(
        { kind: 'hook', reason: 'dungeon-party validator self-maintenance' },
        { keepInbox: true },
      )
      await healer.whenIdle()
    } catch (error) {
      this.service.completeValidatorMaintenance(
        { sessionId: healerSessionId }, runId, instruction.instructionId, false,
      )
      throw error
    }
    healer.send(createUserMessage({
      content: [{
        type: 'text',
        text: `Validator maintenance was authorized by the tank. Stabilize this original Session, then call member_self_maintain with the result:\n${JSON.stringify(instruction, null, 2)}`,
      }],
      source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
    }), 'next-turn', true)
    return instruction
  }

  dispatchBattleRes(actor: Actor, runId: string, resurrectionId: string): void {
    const run = this.service.getRunForActor(actor, runId)
    if (run.slots.tank.currentSessionId !== actor.sessionId) {
      throw new DungeonError('FORBIDDEN', 'Only the bound tank can dispatch DPS resurrection')
    }
    const request = run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId)
    if (request?.status !== 'issued') throw new DungeonError('RESURRECTION_NOT_ACTIVE', 'DPS resurrection is not issued')
    this.dispatchRecoveryToHealer(runId, resurrectionId, {
      kind: 'dps-resurrection',
      request,
      instructions: ['Call battle_res start-dps, inspect the target state, then complete-dps with resume or replace mode.'],
    })
  }

  dispatchCommanderRescue(runId: string, ticketId: string): void {
    const run = this.service.getRun(runId)
    const ticket = run.commanderRescueTickets.find((item) => item.ticketId === ticketId)
    if (ticket?.status !== 'issued') throw new DungeonError('TICKET_NOT_ACTIVE', 'Commander rescue ticket is not issued')
    this.dispatchRecoveryToHealer(runId, ticketId, {
      kind: 'commander-resurrection',
      ticket,
      checkpoint: run.commanderCheckpoint,
      instructions: ['Call battle_res consume-commander, then complete-commander to restore only the original Lead Session.'],
    })
  }

  async ensureMember(actor: Actor, runId: string, slot: ChildSlot): Promise<string> {
    const run = this.service.getRunForActor(actor, runId)
    if (run.slots.tank.currentSessionId !== actor.sessionId) {
      throw new DungeonError('FORBIDDEN', 'Only the bound tank can create party members')
    }
    const existing = run.slots[slot].currentSessionId
    const key = keyFor(runId, slot)
    if (existing && this.handles.has(key)) return existing
    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight
    const creation = existing
      ? this.restoreMember(actor, runId, slot, existing)
      : this.createMember(actor, runId, slot)
    this.pending.set(key, creation)
    try {
      return await creation
    } finally {
      this.pending.delete(key)
    }
  }

  async recoverCommander(actor: Actor, runId: string, ticketId: string): Promise<CommanderRescueTicket> {
    const run = this.service.getRunForActor(actor, runId)
    const ticket = run.commanderRescueTickets.find((item) => item.ticketId === ticketId)
    if (ticket?.status !== 'consumed') {
      throw new DungeonError('TICKET_NOT_ACTIVE', 'Commander rescue ticket is not active')
    }
    let commander = this.agents.get(ticket.targetSessionId as SessionId)
    let resumedHandle: AgentHandle | undefined
    let completed: CommanderRescueTicket | undefined
    try {
      if (commander) {
        commander.cancel(
          { kind: 'hook', reason: 'dungeon-party commander recovery' },
          { keepInbox: true },
        )
        await commander.whenIdle()
      } else {
        resumedHandle = await this.agents.resume({
          resumeSessionId: ticket.targetSessionId as SessionId,
          setup: async (agentCtx: Context) => {
            await this.presets.mount(agentCtx, 'dungeon-party')
          },
        })
        commander = resumedHandle.agent
      }
      completed = this.service.completeCommanderResurrection(actor, runId, ticketId, {
        success: true,
        sessionId: String(commander.id),
      })
    } catch (error) {
      if (resumedHandle) await resumedHandle.dispose()
      this.service.completeCommanderResurrection(actor, runId, ticketId, {
        success: false,
        sessionId: ticket.targetSessionId,
      })
      throw error
    }
    if (resumedHandle) this.commanderHandles.set(runId, resumedHandle)
    const recovered = this.service.getRun(runId)
    if (!completed) throw new DungeonError('COMMANDER_RECOVERY_INCOMPLETE', 'Commander recovery produced no ticket result')
    commander.send(createUserMessage({
      content: [{
        type: 'text',
        text: `Commander recovery completed. Review this checkpoint and call party_resume_dispatch only after reconciliation:\n${JSON.stringify(recovered.commanderCheckpoint, null, 2)}`,
      }],
      source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
    }), 'next-turn', true)
    return completed
  }

  async completeDpsResurrection(
    actor: Actor,
    runId: string,
    resurrectionId: string,
    mode: 'resume' | 'replace',
  ): Promise<ResurrectionRequest> {
    const run = this.service.getRunForActor(actor, runId)
    const request = run.resurrectionRequests.find((item) => item.resurrectionId === resurrectionId)
    if (request?.status !== 'consumed') {
      throw new DungeonError('RESURRECTION_NOT_ACTIVE', 'DPS resurrection is not active')
    }
    const key = keyFor(runId, request.targetSlot)
    const previousHandle = this.handles.get(key)
    if (mode === 'resume') {
      let handle = previousHandle
      let restored = false
      if (!handle) {
        const live = this.agents.get(request.targetSessionId as SessionId)
        if (live) {
          handle = { agent: live, dispose: async () => undefined } as AgentHandle
        } else {
          const tankSessionId = run.slots.tank.currentSessionId
          if (!tankSessionId) throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The run has no bound tank')
          const tankAgent = this.agents.get(tankSessionId as SessionId)
          if (!tankAgent) throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The bound tank Agent is not live')
          handle = await tankAgent.ctx.agents.resume({
            resumeSessionId: request.targetSessionId as SessionId,
            agentOptions: this.childAgentOptions(tankAgent),
            setup: async (agentCtx: Context) => {
              this.presets.composeFrom(agentCtx, tankAgent.ctx)
              agentCtx.tools.restrict({ allow: roleTools[request.targetSlot] })
              agentCtx.systemPrompt.section({
                name: 'deployment:persona', order: 0, text: rolePersonas[request.targetSlot],
              })
              this.ensureGuardInstalled(agentCtx, runId, request.targetSlot)
            },
          })
          restored = true
        }
        this.handles.set(key, handle)
      }
      this.ensureSubagentDescriptor(handle.agent, request.targetSlot)
      try {
        if (!restored) {
          handle.agent.cancel(
            { kind: 'hook', reason: 'dungeon-party battle resurrection resume' },
            { keepInbox: true },
          )
          await handle.agent.whenIdle()
        }
      } catch (error) {
        if (restored) {
          this.handles.delete(key)
          await handle.dispose()
        }
        this.service.completeBattleRes(actor, runId, resurrectionId, {
          success: false,
          mode,
          sessionId: request.targetSessionId,
        })
        throw error
      }
      const sessionId = String(handle.agent.id)
      const completed = this.service.completeBattleRes(actor, runId, resurrectionId, { success: true, mode, sessionId })
      handle.agent.send(createUserMessage({
        content: [{
          type: 'text',
          text: `Resurrection packet for run ${runId}. Review assigned work and durable checkpoints, then call work_claim before resuming changes:\n${JSON.stringify(Object.values(run.tasks).filter((task) => task.ownerSlot === request.targetSlot).map((task) => ({ workOrder: task.workOrder, lastCheckpoint: task.lastCheckpoint })), null, 2)}`,
        }],
        source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
      }), 'next-turn', true)
      return completed
    }
    const tankSessionId = run.slots.tank.currentSessionId
    if (!tankSessionId) throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The run has no bound tank')
    const tankAgent = this.agents.get(tankSessionId as SessionId)
    if (!tankAgent) throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The bound tank Agent is not live')
    const generation = run.slots[request.targetSlot].generation + 1
    const sessionId = `${runId}-${request.targetSlot}-g${generation}`
    const handle = await tankAgent.ctx.agents.create({
      sessionId: sessionId as SessionId,
      agentOptions: this.childAgentOptions(tankAgent),
      meta: {
        cwd: run.workspaceRoot,
        parentSession: tankSessionId as SessionId,
        origin: 'subagent',
        delegationDepth: 1,
        agentPreset: 'dungeon-party',
      },
      setup: async (agentCtx: Context) => {
        this.presets.composeFrom(agentCtx, tankAgent.ctx)
        agentCtx.tools.restrict({ allow: roleTools[request.targetSlot] })
        agentCtx.systemPrompt.section({
          name: 'deployment:persona',
          order: 0,
          text: rolePersonas[request.targetSlot],
        })
        this.ensureGuardInstalled(agentCtx, runId, request.targetSlot)
      },
    })
    this.ensureSubagentDescriptor(handle.agent, request.targetSlot)
    let completed: ResurrectionRequest
    try {
      completed = this.service.completeBattleRes(actor, runId, resurrectionId, {
        success: true,
        mode: 'replace',
        sessionId: String(handle.agent.id),
      })
    } catch (error) {
      await handle.dispose()
      throw error
    }
    this.handles.set(key, handle)
    if (previousHandle) await previousHandle.dispose()
    return completed
  }

  requestCheckpoint(actor: Actor, runId: string, taskId: string): CheckpointRequest {
    const request = this.service.requestTaskCheckpoint(actor, runId, taskId)
    const handle = this.handles.get(keyFor(runId, request.slot))
    if (!handle) throw new DungeonError('DPS_AGENT_UNAVAILABLE', `Agent for ${request.slot} is not live`)
    handle.agent.send(createUserMessage({
      content: [{
        type: 'text',
        text: `Checkpoint requested for task ${taskId}. Respond with member_checkpoint before ${request.dueAt}. Request:\n${JSON.stringify(request, null, 2)}`,
      }],
      source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
    }), 'next-step', true)
    return request
  }

  async claimTaskWithAudit(actor: Actor, runId: string, taskId: string): Promise<TaskLease> {
    return this.withWorkspaceAuditLock(runId, async () => {
      const lease = this.service.claimTask(actor, runId, taskId)
      await this.captureLeaseAudit(actor, runId, taskId, lease.leaseId)
      return lease
    })
  }

  async beginLeaseAudit(actor: Actor, runId: string, taskId: string, leaseId: string): Promise<void> {
    await this.withWorkspaceAuditLock(runId, () => this.captureLeaseAudit(actor, runId, taskId, leaseId))
  }

  async submitExecutionWithAudit(actor: Actor, runId: string, report: ExecutionReport): Promise<TaskRecord> {
    // Shield the lease for the duration of the audit+commit so a concurrent
    // poll-triggered sweep cannot revoke the work mid-submit.
    this.service.protectSubmit(runId, report.taskId)
    try {
      return await this.withWorkspaceAuditLock(runId, async () => {
        await this.auditWorkspace(actor, runId, report)
        const task = this.service.submitExecution(actor, runId, report)
        this.completeLeaseAudit(runId, report.taskId)
        return task
      })
    } finally {
      this.service.releaseSubmit(runId, report.taskId)
    }
  }

  async auditWorkspaceBeforeSubmit(actor: Actor, runId: string, report: ExecutionReport): Promise<void> {
    await this.withWorkspaceAuditLock(runId, () => this.auditWorkspace(actor, runId, report))
  }

  private async captureLeaseAudit(actor: Actor, runId: string, taskId: string, leaseId: string): Promise<void> {
    const run = this.service.getRunForActor(actor, runId)
    const task = run.tasks[taskId]
    if (task?.activeLease?.leaseId !== leaseId) throw new DungeonError('STALE_LEASE', 'Cannot audit a stale lease')
    this.leaseAudits.set(`${runId}:${taskId}`, {
      leaseId,
      snapshot: await workspaceComputationQueue.snapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes()),
      accumulated: new Set(),
    })
  }

  /**
   * Rebuild audit baselines for active leases that lost their in-memory
   * baseline (typically after a host restart). Changes made before the
   * rebuild are not attributable anymore; everything after is fully audited.
   */
  async rebuildMissingLeaseAudits(runId: string): Promise<void> {
    await this.withWorkspaceAuditLock(runId, async () => {
      const run = this.service.getRun(runId)
      if (run.phase !== 'EXECUTING' && run.phase !== 'REPAIR') return
      for (const task of Object.values(run.tasks)) {
        if (!task.activeLease || !task.ownerSlot) continue
        const key = `${runId}:${task.workOrder.id}`
        if (this.leaseAudits.has(key)) continue
        this.leaseAudits.set(key, {
          leaseId: task.activeLease.leaseId,
          snapshot: await workspaceComputationQueue.snapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes()),
          accumulated: new Set(),
        })
      }
    })
  }

  private async auditWorkspace(actor: Actor, runId: string, report: ExecutionReport): Promise<void> {
    const run = this.service.getRunForActor(actor, runId)
    const audit = this.leaseAudits.get(`${runId}:${report.taskId}`)
    if (!audit || audit.leaseId !== report.leaseId) {
      throw new DungeonError('WORKSPACE_AUDIT_MISSING', 'The active lease has no host workspace baseline')
    }
    const current = await workspaceComputationQueue.snapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes())
    // Union of everything observed since lease start: earlier checkpoint
    // re-baselines moved their deltas into `accumulated`, so pre-checkpoint
    // (and out-of-scope) changes can no longer be silently absorbed.
    const changedFiles = [...new Set([...audit.accumulated, ...diffWorkspaceSnapshots(audit.snapshot, current)])].sort()
    // Toolchain byproducts (lockfiles and the like) are excused everywhere in
    // the audit: they are not scope violations and they must not break the
    // serial changedFiles comparison when the executor did not report them.
    const byproductScopes = this.service.getSubmitByproductScopes()
    const isByproduct = (path: string) => byproductScopes.some((scope) => path === scope || matchesGlob(path, scope))
    const activeScopes = Object.values(run.tasks).flatMap((task) => task.activeLease ? task.workOrder.writeScopes : [])
    const outsideActiveScopes = changedFiles.filter((path) =>
      !isByproduct(path) && !activeScopes.some((scope) => path === scope || matchesGlob(path, scope)),
    )
    if (outsideActiveScopes.length > 0) {
      throw new DungeonError(
        'ACTUAL_WRITE_SCOPE_VIOLATION',
        `Host-observed workspace changes are outside active scopes: ${outsideActiveScopes.join(', ')}`,
      )
    }
    if (run.scopeEnforcementMode === 'serial') {
      const reported = [...new Set(report.changedFiles)].sort()
      const actual = changedFiles.filter((path) =>
        run.tasks[report.taskId]!.workOrder.writeScopes.some((scope) => path === scope || matchesGlob(path, scope)),
      ).sort()
      // Strict equality is unachievable in a live workspace: toolchains drop
      // byproducts the executor cannot foresee. Excuse configured byproducts,
      // and report the exact delta otherwise so the executor can correct the
      // report instead of guessing.
      const reportedSet = new Set(reported)
      const actualSet = new Set(actual)
      const unreported = actual.filter((path) => !reportedSet.has(path) && !isByproduct(path))
      const overReported = reported.filter((path) => !actualSet.has(path))
      if (unreported.length > 0 || overReported.length > 0) {
        throw new DungeonError(
          'CHANGED_FILES_MISMATCH',
          `Reported changedFiles do not match the host-observed serial workspace delta. Unreported changes: [${boundedPathList(unreported)}]; reported but not observed: [${boundedPathList(overReported)}]. Toolchain byproducts are excused automatically; correct the list and resubmit.`,
        )
      }
    }
  }

  completeLeaseAudit(runId: string, taskId: string): void {
    this.leaseAudits.delete(`${runId}:${taskId}`)
  }

  /**
   * Re-baseline the workspace audit for an active lease after a checkpoint
   * renewed it. The delta since the previous baseline is accumulated first,
   * so the final submit audit still sees every change made across the whole
   * lease instead of only the slice after the last checkpoint.
   */
  async refreshLeaseAudit(runId: string, taskId: string): Promise<void> {
    await this.withWorkspaceAuditLock(runId, async () => {
      const audit = this.leaseAudits.get(`${runId}:${taskId}`)
      if (!audit) return
      const run = this.service.getRun(runId)
      const task = run.tasks[taskId]
      if (!task?.activeLease || task.activeLease.leaseId !== audit.leaseId) return
      const next = await workspaceComputationQueue.snapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes())
      for (const path of diffWorkspaceSnapshots(audit.snapshot, next)) audit.accumulated.add(path)
      audit.snapshot = next
    })
  }

  async interruptTask(actor: Actor, runId: string, taskId: string, turnId: string): Promise<TaskRecord> {
    const task = this.service.requestTaskInterrupt(actor, runId, taskId, turnId)
    if (!task.ownerSlot) throw new DungeonError('TASK_NOT_ASSIGNED', `Task ${taskId} has no DPS owner`)
    const handle = this.handles.get(keyFor(runId, task.ownerSlot))
    if (!handle) throw new DungeonError('DPS_AGENT_UNAVAILABLE', `Agent for ${task.ownerSlot} is not live`)
    try {
      handle.agent.cancel(
        { kind: 'hook', reason: `dungeon-party interrupt task ${taskId} turn ${turnId}` },
        { keepInbox: true },
      )
      await handle.agent.whenIdle()
    } catch (error) {
      this.service.completeTaskInterrupt(runId, taskId, turnId, {
        success: false,
        quarantinedFiles: [],
      })
      throw error
    }
    const audit = this.leaseAudits.get(`${runId}:${taskId}`)
    const run = this.service.getRun(runId)
    const quarantinedFiles = audit
      ? diffWorkspaceSnapshots(
          audit.snapshot,
          await workspaceComputationQueue.snapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes()),
        )
      : []
    this.leaseAudits.delete(`${runId}:${taskId}`)
    return this.service.completeTaskInterrupt(runId, taskId, turnId, {
      success: true,
      quarantinedFiles,
    })
  }

  sendPartyMessage(
    actor: Actor,
    runId: string,
    toSlot: PartySlot,
    input: PartyMessageInput,
  ): PartyMessage {
    const run = this.service.getRunForActor(actor, runId)
    const targetSessionId = run.slots[toSlot].currentSessionId
    if (!targetSessionId) throw new DungeonError('UNBOUND_SLOT', `Target slot ${toSlot} is not bound`)
    const target = toSlot === 'tank'
      ? this.agents.get(targetSessionId as SessionId)
      : this.handles.get(keyFor(runId, toSlot as ChildSlot))?.agent
    if (!target) throw new DungeonError('TARGET_AGENT_UNAVAILABLE', `Agent for ${toSlot} is not live`)
    const message = this.service.sendPartyMessage(actor, runId, toSlot, input)
    target.send(createUserMessage({
      content: [{ type: 'text', text: `Dungeon-party message:\n${JSON.stringify(message, null, 2)}` }],
      source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
    }), 'next-step', true)
    return message
  }

  dispatchTask(actor: Actor, runId: string, taskId: string): void {
    const run = this.service.getRunForActor(actor, runId)
    if (run.slots.tank.currentSessionId !== actor.sessionId) {
      throw new DungeonError('FORBIDDEN', 'Only the bound tank can dispatch work orders')
    }
    const task = run.tasks[taskId]
    if (!task?.ownerSlot) throw new DungeonError('TASK_NOT_ASSIGNED', `Task ${taskId} is not assigned`)
    const handle = this.handles.get(keyFor(runId, task.ownerSlot))
    if (!handle) throw new DungeonError('DPS_AGENT_UNAVAILABLE', `Agent for ${task.ownerSlot} is not live`)
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
    }
    handle.agent.send(createUserMessage({
      content: [{ type: 'text', text: `Assigned dungeon-party work order:\n${JSON.stringify(payload, null, 2)}` }],
      source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
    }), 'next-turn', true)
  }

  forgetDisposedAgent(sessionId: string): void {
    for (const [key, handle] of this.handles) {
      if (String(handle.agent.id) === sessionId) this.handles.delete(key)
    }
    for (const [runId, handle] of this.commanderHandles) {
      if (String(handle.agent.id) === sessionId) this.commanderHandles.delete(runId)
    }
  }

  async disposeRun(runId: string): Promise<void> {
    const prefix = `${runId}:`
    const handles: AgentHandle[] = []
    for (const [key, handle] of this.handles) {
      if (!key.startsWith(prefix)) continue
      this.handles.delete(key)
      handles.push(handle)
    }
    for (const key of this.leaseAudits.keys()) {
      if (key.startsWith(prefix)) this.leaseAudits.delete(key)
    }
    for (const key of this.redispatchAt.keys()) {
      if (key.startsWith(prefix)) this.redispatchAt.delete(key)
    }
    this.drainNoticeTaskSetVersions.delete(runId)
    this.workspaceAuditLocks.delete(runId)
    const commanderHandle = this.commanderHandles.get(runId)
    if (commanderHandle) {
      this.commanderHandles.delete(runId)
      handles.push(commanderHandle)
    }
    await Promise.all(handles.map((handle) => handle.dispose()))
  }

  async dispose(): Promise<void> {
    const handles = [...this.handles.values(), ...this.commanderHandles.values()]
    this.handles.clear()
    this.commanderHandles.clear()
    this.leaseAudits.clear()
    this.workspaceAuditLocks.clear()
    this.redispatchAt.clear()
    this.drainNoticeTaskSetVersions.clear()
    await Promise.all(handles.map((handle) => handle.dispose()))
  }

  /**
   * Install the execution guard at most once per agent context while keeping
   * the run/slot binding fresh: a context reused across runs reads the
   * current binding from the WeakMap instead of a stale closure.
   */
  private ensureGuardInstalled(agentCtx: Context, runId: string, slot: ChildSlot): void {
    if (slot === 'healer') return
    this.guardBindings.set(agentCtx, { runId, slot: slot as DpsSlot })
    if (this.guardedContexts.has(agentCtx)) return
    this.guardedContexts.add(agentCtx)
    this.installExecutionGuard(agentCtx)
  }

  private installExecutionGuard(agentCtx: Context): void {
    agentCtx.on('tools/pre-execute', async (exec, next) => {
      if (exec.name !== 'write' && exec.name !== 'edit' && exec.name !== 'bash') return next()
      const binding = this.guardBindings.get(agentCtx)
      const guard = binding ? this.service.getExecutionGuardView(binding.runId, binding.slot) : undefined
      if (!guard) {
        return {
          kind: 'deny',
          reason: 'No active dungeon task lease. Call work_claim for your assigned task before write/edit/bash.',
        }
      }
      const args = exec.arguments as Record<string, unknown>
      if (exec.name === 'write' || exec.name === 'edit') {
        const suppliedPath = args.file_path ?? args.path
        if (typeof suppliedPath !== 'string') return { kind: 'deny', reason: 'File mutation requires a concrete file path.' }
        const root = resolve(guard.workspaceRoot)
        const absolutePath = resolve(root, suppliedPath)
        const workspacePath = relative(root, absolutePath).replaceAll('\\', '/')
        const allowed = workspacePath && !workspacePath.startsWith('../') && !isAbsolute(workspacePath) &&
          guard.writeScopes.some((scope) => workspacePath === scope || matchesGlob(workspacePath, scope))
        if (!allowed) return { kind: 'deny', reason: `Path ${suppliedPath} is outside the active task writeScopes.` }
        const escape = findSymlinkEscape(root, absolutePath)
        if (escape) {
          return {
            kind: 'deny',
            reason: `Path ${suppliedPath} escapes the workspace through a symlink (${escape}); writes must target regular files inside the workspace.`,
          }
        }
      } else {
        const command = typeof args.command === 'string' ? args.command.trim().replace(/\s+/g, ' ') : ''
        // Preventive interception for git commands that rewrite workspace
        // content: the snapshot audit only catches them after the damage.
        // Non-destructive git (status/log/diff/add/commit/…) stays available.
        const destructiveGit = (/^git\s+reset\b/.test(command) && /(^|\s)--hard\b/.test(command)) ||
          /^git\s+(?:clean|checkout|switch|restore|stash)\b/.test(command)
        if (destructiveGit) {
          return {
            kind: 'deny',
            reason: `Destructive git command denied: ${command}. It rewrites workspace content that the scope audit can only detect after the fact. Use non-destructive git (status/log/diff/add/commit) instead.`,
          }
        }
        // Shell-level write interception. Regular expressions cannot parse
        // shell, so this is a deny-list of the common write primitives that
        // bypass the scope-checked write/edit tools; real isolation still
        // needs an OS/DSH capability sandbox (see review P0-02).
        const intercepted = BASH_WRITE_INTERCEPTS.find(({ pattern }) => pattern.test(command))
        if (intercepted) {
          return {
            kind: 'deny',
            reason: `Denied under a dungeon lease: ${intercepted.reason} (${command}). Perform file changes through the scope-checked write/edit tools instead of the shell.`,
          }
        }
        const isGlobal = /^(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall|update|upgrade)\b/i.test(command) ||
          /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:format|fmt|codegen|generate|migrate)\b/i.test(command) ||
          /\b(?:prisma|drizzle|typeorm)\s+(?:generate|migrate)\b/i.test(command)
        const owned = guard.globalCommands.some((item) => item.trim().replace(/\s+/g, ' ') === command)
        if (isGlobal && !owned) return { kind: 'deny', reason: `Workspace-global command ${command} is not owned by the active task.` }
      }
      return next()
    })
  }

  private dispatchRecoveryToHealer(runId: string, recoveryId: string, payload: unknown): void {
    if (this.dispatchedRecoveryIds.has(recoveryId)) return
    const run = this.service.getRun(runId)
    const healerSessionId = run.slots.healer.currentSessionId
    const healer = this.handles.get(keyFor(runId, 'healer'))?.agent ??
      (healerSessionId ? this.agents.get(healerSessionId as SessionId) : undefined)
    if (!healer) throw new DungeonError('HEALER_AGENT_UNAVAILABLE', 'The healer Agent is not live')
    healer.send(createUserMessage({
      content: [{ type: 'text', text: `Authorized dungeon-party recovery:\n${JSON.stringify(payload, null, 2)}` }],
      source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
    }), 'next-turn', true)
    this.dispatchedRecoveryIds.add(recoveryId)
  }

  private ensureSubagentDescriptor(agent: Agent, slot: ChildSlot): void {
    if (agent.session.events.some((event) => event.type === 'subagent/descriptor')) return
    agent.session.append('subagent/descriptor', snapshotSubagentDescriptor({
      mode: 'continuable',
      provider: 'dungeon-party',
      label: `${rolePersonaNames[slot]} · ${slot}`,
      ...agent.options.provider ? { agentProvider: agent.options.provider } : {},
      ...agent.options.model ? { agentModel: agent.options.model } : {},
      persona: rolePersonas[slot],
      toolFilter: { allow: roleTools[slot] },
    }))
  }

  private async restoreMember(actor: Actor, runId: string, slot: ChildSlot, sessionId: string): Promise<string> {
    const key = keyFor(runId, slot)
    const live = this.agents.get(sessionId as SessionId)
    if (live) {
      this.ensureSubagentDescriptor(live, slot)
      // An agent created outside the dungeon flow never ran our setup; make
      // sure its context still carries the execution guard.
      const liveCtx = (live as { ctx?: Context }).ctx
      if (liveCtx) this.ensureGuardInstalled(liveCtx, runId, slot)
      this.handles.set(key, { agent: live, dispose: async () => undefined } as AgentHandle)
      return sessionId
    }
    const tankAgent = this.agents.get(actor.sessionId as SessionId)
    if (!tankAgent) throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The bound tank Agent is not live')
    const handle = await tankAgent.ctx.agents.resume({
      resumeSessionId: sessionId as SessionId,
      agentOptions: this.childAgentOptions(tankAgent),
      setup: async (agentCtx: Context) => {
        this.presets.composeFrom(agentCtx, tankAgent.ctx)
        agentCtx.tools.restrict({ allow: roleTools[slot] })
        agentCtx.systemPrompt.section({
          name: 'deployment:persona',
          order: 0,
          text: rolePersonas[slot],
        })
        this.ensureGuardInstalled(agentCtx, runId, slot)
      },
    })
    this.ensureSubagentDescriptor(handle.agent, slot)
    this.handles.set(key, handle)
    return String(handle.agent.id)
  }

  private async createMember(actor: Actor, runId: string, slot: ChildSlot): Promise<string> {
    const run = this.service.getRunForActor(actor, runId)
    const tankAgent = this.agents.get(actor.sessionId as SessionId)
    if (!tankAgent) throw new DungeonError('TANK_AGENT_UNAVAILABLE', 'The bound tank Agent is not live')
    const generation = run.slots[slot].generation + 1
    const sessionId = `${runId}-${slot}-g${generation}`
    const handle = await tankAgent.ctx.agents.create({
      sessionId: sessionId as SessionId,
      agentOptions: this.childAgentOptions(tankAgent),
      meta: {
        cwd: run.workspaceRoot,
        parentSession: actor.sessionId as SessionId,
        origin: 'subagent',
        delegationDepth: 1,
        agentPreset: 'dungeon-party',
      },
      setup: async (agentCtx: Context) => {
        this.presets.composeFrom(agentCtx, tankAgent.ctx)
        agentCtx.tools.restrict({ allow: roleTools[slot] })
        agentCtx.systemPrompt.section({
          name: 'deployment:persona',
          order: 0,
          text: rolePersonas[slot],
        })
        this.ensureGuardInstalled(agentCtx, runId, slot)
      },
    })
    this.ensureSubagentDescriptor(handle.agent, slot)
    try {
      this.service.bindMember(actor, runId, slot, String(handle.agent.id))
      this.handles.set(keyFor(runId, slot), handle)
      return String(handle.agent.id)
    } catch (error) {
      await handle.dispose()
      throw error
    }
  }
}

function keyFor(runId: string, slot: ChildSlot): string {
  return `${runId}:${slot}`
}

/** Cap diagnostic path lists so a huge delta cannot blow up an error body. */
function boundedPathList(paths: string[], limit = 20): string {
  if (paths.length <= limit) return paths.join(', ')
  return `${paths.slice(0, limit).join(', ')}, … (${paths.length - limit} more)`
}

/**
 * Shell constructs that can write files without going through the
 * scope-checked write/edit tools. This is a conservative deny-list, not a
 * shell parser: false positives (a denied exotic-but-safe command) are far
 * cheaper than cross-task writes. Matches are reported with a reason so the
 * model can rephrase through the file tools.
 */
const BASH_WRITE_INTERCEPTS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(?:^|[;&|(\s])\d*>{1,2}/, reason: 'output redirection' },
  { pattern: /\btee\b/, reason: 'tee' },
  { pattern: /\bsed\b(?=[^|;&]*[ \t]-i(?:[ \t=]|$))/, reason: 'sed in-place edit' },
  { pattern: /(?:^|[;&|(\s])(?:cp|mv|rm|rsync|dd|truncate|chmod|chown|install|mkfifo|shred)\s/, reason: 'filesystem mutation command' },
  { pattern: /\b(?:node|nodejs|deno|bun)\b[^\n;&|]*[ \t](?:-e|--eval|-p|--print)\b/, reason: 'node one-liner execution' },
  { pattern: /\bpython[0-9.]*\b[^\n;&|]*[ \t]-c\b/, reason: 'python one-liner execution' },
  { pattern: /\b(?:ruby|perl)\b[^\n;&|]*[ \t]-e\b/, reason: 'interpreter one-liner execution' },
  { pattern: /(?:^|[;&|(\s])(?:bash|sh|zsh|dash)[ \t]+-c\b/, reason: 'nested shell execution' },
  { pattern: /(?:^|[;&|(\s])eval\b/, reason: 'shell eval' },
]

/**
 * Best-effort detection of a write target escaping the workspace through
 * symlinks. The target itself must not be a symlink (no-follow semantics),
 * and the deepest existing ancestor must resolve inside the real root.
 * Returns a short diagnostic when the path escapes; undefined when
 * containment holds or cannot be determined (IO failures fall back to the
 * lexical scope check already performed by the caller).
 */
function findSymlinkEscape(root: string, absolutePath: string): string | undefined {
  try {
    const rootReal = realpathSync(root)
    const contained = (candidate: string): boolean => {
      const rel = relative(rootReal, candidate)
      return rel === '' || (rel !== '..' && !rel.startsWith('..') && !isAbsolute(rel))
    }
    let anchor = absolutePath
    while (!existsSync(anchor)) {
      const parent = dirname(anchor)
      if (parent === anchor) break
      anchor = parent
    }
    if (!contained(realpathSync(anchor))) return `${anchor} -> ${realpathSync(anchor)}`
    if (existsSync(absolutePath)) {
      const targetReal = realpathSync(absolutePath)
      if (!contained(targetReal)) return `${absolutePath} -> ${targetReal}`
    } else {
      try {
        // existsSync follows links, so a dangling symlink reports false yet
        // still redirects creation to its (possibly external) target.
        if (lstatSync(absolutePath).isSymbolicLink()) {
          return `${absolutePath} is a symlink (no-follow write policy)`
        }
      } catch {
        // Target absent and not a symlink: creation stays inside the anchor.
      }
    }
    return undefined
  } catch {
    return undefined
  }
}
