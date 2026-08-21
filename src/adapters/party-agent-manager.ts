import type { Context } from '@deepseek-ai/cordis'
import { matchesGlob, relative, resolve } from 'node:path'
import type { Agent, AgentHandle, AgentRegistry } from '@deepseek-ai/dsh-agent'
import type { AgentPresets } from '@deepseek-ai/dsh-agent-presets'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import type { SessionId } from '@deepseek-ai/dsh-session'

import {
  DungeonError,
  type Actor,
  type DungeonRun,
  type DungeonService,
  type ExecutionReport,
  type PartyMessageInput,
  type PartySlot,
  type RunPhase,
} from '../service/dungeon-service.js'
import {
  createWorkspaceSnapshot,
  diffWorkspaceSnapshots,
  type WorkspaceSnapshot,
} from './workspace-fingerprint.js'

type ChildSlot = Exclude<PartySlot, 'tank'>

const roleTools: Record<ChildSlot, string[]> = {
  'dps-1': ['party_status', 'party_wait', 'party_health', 'work_claim', 'work_submit', 'member_checkpoint', 'party_message', 'read', 'write', 'edit', 'glob', 'grep', 'bash'],
  'dps-2': ['party_status', 'party_wait', 'party_health', 'work_claim', 'work_submit', 'member_checkpoint', 'party_message', 'read', 'write', 'edit', 'glob', 'grep', 'bash'],
  'dps-3': ['party_status', 'party_wait', 'party_health', 'work_claim', 'work_submit', 'member_checkpoint', 'party_message', 'read', 'write', 'edit', 'glob', 'grep', 'bash'],
  healer: ['party_status', 'party_wait', 'party_health', 'validation_manifest', 'validation_submit', 'member_self_maintain', 'battle_res', 'party_message', 'read', 'glob', 'grep'],
}

const rolePersonas: Record<ChildSlot, string> = {
  'dps-1': 'You are Pyra the Flameblade, the party’s Flame Engineer Executor (DPS-1). Execute only your structured work order and active lease. Re-read files before editing, stay inside writeScopes, submit evidence and checkpoints, and never claim the whole run is complete.',
  'dps-2': 'You are Nyx the Shadowstrider, the party’s Shadow Scout Executor (DPS-2). Execute only your structured work order and active lease. Re-read files before editing, stay inside writeScopes, submit evidence and checkpoints, and never claim the whole run is complete.',
  'dps-3': 'You are Aster the Starweaver, the party’s Arcane Architect Executor (DPS-3). Execute only your structured work order and active lease. Re-read files before editing, stay inside writeScopes, submit evidence and checkpoints, and never claim the whole run is complete.',
  healer: 'You are Lumina the Oracle, the independent Holy Adjudicator Validator (Healer). Inspect the current manifest and evidence, submit a complete validation report, and perform only authorized maintenance or resurrection. Do not modify implementation files or impersonate the Commander.',
}

export class PartyAgentManager {
  private readonly handles = new Map<string, AgentHandle>()
  private readonly commanderHandles = new Map<string, AgentHandle>()
  private readonly dispatchedRecoveryIds = new Set<string>()
  private readonly leaseAudits = new Map<string, { leaseId: string; snapshot: WorkspaceSnapshot }>()
  private readonly pending = new Map<string, Promise<string>>()
  /** Serializes dispatch per run so concurrent kicks cannot double-assign. */
  private readonly dispatchLocks = new Map<string, Promise<unknown>>()
  /** Rate-limits dangling-lease turn-end nudges per session. */
  private readonly turnEndNudges = new Map<string, number>()
  /** Agent contexts that already carry the execution guard. */
  private readonly guardedContexts = new WeakSet<Context>()
  /** Unexpected scheduler errors, kept for diagnostics instead of failing post-commit flows. */
  readonly schedulerErrors: unknown[] = []

  constructor(
    private readonly service: DungeonService,
    private readonly agents: AgentRegistry,
    private readonly presets: AgentPresets,
    private readonly childRoute: { provider?: string; model?: string } = {},
  ) {}

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
    for (const runId of this.service.listRunIds()) {
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

      for (const task of Object.values(swept.tasks)) {
        if (task.status !== 'running' || !task.activeLease || !task.ownerSlot) continue
        const before = task.progressState
        this.service.evaluateTaskProgress(runId, task.workOrder.id, {})
        const after = this.service.getRun(runId).tasks[task.workOrder.id]
        if (!after || after.progressState === before) continue
        if (after.progressState === 'suspected-stalled') {
          try {
            this.requestCheckpoint(tankActor, runId, task.workOrder.id)
          } catch {
            // The DPS agent may not be live; the next watchdog pass retries.
          }
        } else if (after.progressState === 'stalled') {
          this.agents.get(tankSessionId as SessionId)?.send(createUserMessage({
            content: [{
              type: 'text',
              text: `Task stall confirmed for ${task.workOrder.id} on ${task.ownerSlot}: ${after.missedCheckpoints ?? 0} missed checkpoints. Use party_request_checkpoint for evidence, or party_interrupt once the task is confirmed stalled.`,
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
    const now = Date.now()
    const last = this.turnEndNudges.get(sessionId)
    if (last !== undefined && now - last < 60_000) return
    for (const runId of this.service.listRunIds()) {
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

  private async dispatchAvailableTasksUnlocked(actor: Actor, runId: string): Promise<string[]> {
    const assigned: string[] = []
    const run = this.service.getRunForActor(actor, runId)
    if (run.phase !== 'EXECUTING' && run.phase !== 'REPAIR') return assigned
    const busySlots = new Set(Object.values(run.tasks)
      .filter((task) => task.status === 'running' && task.ownerSlot)
      .map((task) => task.ownerSlot))
    const freeSlots = (['dps-1', 'dps-2', 'dps-3'] as const).filter((slot) => !busySlots.has(slot))
    const priority = { critical: 0, high: 1, normal: 2, low: 3 } as const
    const readyTasks = Object.values(run.tasks)
      .filter((task) => ['pending', 'ready'].includes(task.status) && !task.ownerSlot)
      .sort((left, right) => priority[left.workOrder.priority] - priority[right.workOrder.priority])

    for (const task of readyTasks) {
      const slot = freeSlots.shift()
      if (!slot) break
      try {
        this.service.preflightTaskAssignment(actor, runId, task.workOrder.id, slot)
        await this.ensureMember(actor, runId, slot)
        this.service.assignTask(actor, runId, task.workOrder.id, slot)
        this.dispatchTask(actor, runId, task.workOrder.id)
        assigned.push(task.workOrder.id)
      } catch (error) {
        if (error instanceof DungeonError && ['SCOPE_OVERLAP', 'MAX_CONCURRENCY', 'TASK_NOT_READY', 'TASK_NOT_ASSIGNABLE', 'UNMET_DEPENDENCY'].includes(error.code)) {
          freeSlots.unshift(slot)
          continue
        }
        throw error
      }
    }
    return assigned
  }

  async executeValidatorMaintenance(actor: Actor, runId: string): Promise<void> {
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

  async recoverCommander(actor: Actor, runId: string, ticketId: string): Promise<void> {
    const run = this.service.getRunForActor(actor, runId)
    const ticket = run.commanderRescueTickets.find((item) => item.ticketId === ticketId)
    if (ticket?.status !== 'consumed') {
      throw new DungeonError('TICKET_NOT_ACTIVE', 'Commander rescue ticket is not active')
    }
    let commander = this.agents.get(ticket.targetSessionId as SessionId)
    let resumedHandle: AgentHandle | undefined
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
      this.service.completeCommanderResurrection(actor, runId, ticketId, {
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
    commander.send(createUserMessage({
      content: [{
        type: 'text',
        text: `Commander recovery completed. Review this checkpoint and call party_resume_dispatch only after reconciliation:\n${JSON.stringify(recovered.commanderCheckpoint, null, 2)}`,
      }],
      source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
    }), 'next-turn', true)
  }

  async completeDpsResurrection(
    actor: Actor,
    runId: string,
    resurrectionId: string,
    mode: 'resume' | 'replace',
  ): Promise<string> {
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
      this.ensureSubagentDescriptor(handle.agent, runId, request.targetSlot)
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
      this.service.completeBattleRes(actor, runId, resurrectionId, { success: true, mode, sessionId })
      handle.agent.send(createUserMessage({
        content: [{
          type: 'text',
          text: `Resurrection packet for run ${runId}. Review assigned work and durable checkpoints, then call work_claim before resuming changes:\n${JSON.stringify(Object.values(run.tasks).filter((task) => task.ownerSlot === request.targetSlot).map((task) => ({ workOrder: task.workOrder, lastCheckpoint: task.lastCheckpoint })), null, 2)}`,
        }],
        source: { kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' },
      }), 'next-turn', true)
      return sessionId
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
    this.ensureSubagentDescriptor(handle.agent, runId, request.targetSlot)
    try {
      this.service.completeBattleRes(actor, runId, resurrectionId, {
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
    return String(handle.agent.id)
  }

  requestCheckpoint(actor: Actor, runId: string, taskId: string): void {
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
  }

  beginLeaseAudit(actor: Actor, runId: string, taskId: string, leaseId: string): void {
    const run = this.service.getRunForActor(actor, runId)
    const task = run.tasks[taskId]
    if (task?.activeLease?.leaseId !== leaseId) throw new DungeonError('STALE_LEASE', 'Cannot audit a stale lease')
    this.leaseAudits.set(`${runId}:${taskId}`, {
      leaseId,
      snapshot: createWorkspaceSnapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes()),
    })
  }

  auditWorkspaceBeforeSubmit(actor: Actor, runId: string, report: ExecutionReport): void {
    const run = this.service.getRunForActor(actor, runId)
    const audit = this.leaseAudits.get(`${runId}:${report.taskId}`)
    if (!audit || audit.leaseId !== report.leaseId) {
      throw new DungeonError('WORKSPACE_AUDIT_MISSING', 'The active lease has no host workspace baseline')
    }
    const current = createWorkspaceSnapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes())
    const changedFiles = diffWorkspaceSnapshots(audit.snapshot, current)
    const activeScopes = Object.values(run.tasks).flatMap((task) => task.activeLease ? task.workOrder.writeScopes : [])
    const outsideActiveScopes = changedFiles.filter((path) =>
      !activeScopes.some((scope) => path === scope || matchesGlob(path, scope)),
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
      )
      if (JSON.stringify(reported) !== JSON.stringify(actual)) {
        throw new DungeonError('CHANGED_FILES_MISMATCH', 'Reported changedFiles do not match the host-observed serial workspace delta')
      }
    }
  }

  completeLeaseAudit(runId: string, taskId: string): void {
    this.leaseAudits.delete(`${runId}:${taskId}`)
  }

  /**
   * Re-baseline the workspace audit for an active lease. Called when a
   * checkpoint renews the lease so pre-existing external noise no longer
   * blocks the eventual work_submit.
   */
  refreshLeaseAudit(runId: string, taskId: string): void {
    const audit = this.leaseAudits.get(`${runId}:${taskId}`)
    if (!audit) return
    const run = this.service.getRun(runId)
    const task = run.tasks[taskId]
    if (!task?.activeLease || task.activeLease.leaseId !== audit.leaseId) return
    audit.snapshot = createWorkspaceSnapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes())
  }

  async interruptTask(actor: Actor, runId: string, taskId: string, turnId: string): Promise<void> {
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
          createWorkspaceSnapshot(run.workspaceRoot, this.service.getFingerprintIgnoreScopes()),
        )
      : []
    this.leaseAudits.delete(`${runId}:${taskId}`)
    this.service.completeTaskInterrupt(runId, taskId, turnId, {
      success: true,
      quarantinedFiles,
    })
  }

  sendPartyMessage(
    actor: Actor,
    runId: string,
    toSlot: PartySlot,
    input: PartyMessageInput,
  ): void {
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
    await Promise.all(handles.map((handle) => handle.dispose()))
  }

  /** Installs the execution guard at most once per agent context. */
  private ensureGuardInstalled(agentCtx: Context, runId: string, slot: ChildSlot): void {
    if (slot === 'healer') return
    if (this.guardedContexts.has(agentCtx)) return
    this.guardedContexts.add(agentCtx)
    this.installExecutionGuard(agentCtx, runId, slot)
  }

  private installExecutionGuard(agentCtx: Context, runId: string, slot: ChildSlot): void {
    agentCtx.on('tools/pre-execute', async (exec, next) => {
      if (exec.name !== 'write' && exec.name !== 'edit' && exec.name !== 'bash') return next()
      const run = this.service.getRun(runId)
      const task = Object.values(run.tasks).find((candidate) =>
        candidate.ownerSlot === slot && candidate.status === 'running' && candidate.activeLease,
      )
      if (!task) {
        return {
          kind: 'deny',
          reason: 'No active dungeon task lease. Call work_claim for your assigned task before write/edit/bash.',
        }
      }
      const args = exec.arguments as Record<string, unknown>
      if (exec.name === 'write' || exec.name === 'edit') {
        const suppliedPath = args.file_path ?? args.path
        if (typeof suppliedPath !== 'string') return { kind: 'deny', reason: 'File mutation requires a concrete file path.' }
        const root = resolve(run.workspaceRoot)
        const absolutePath = resolve(root, suppliedPath)
        const workspacePath = relative(root, absolutePath).replaceAll('\\', '/')
        const allowed = workspacePath && !workspacePath.startsWith('../') &&
          task.workOrder.writeScopes.some((scope) => workspacePath === scope || matchesGlob(workspacePath, scope))
        if (!allowed) return { kind: 'deny', reason: `Path ${suppliedPath} is outside the active task writeScopes.` }
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
        const isGlobal = /^(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall|update|upgrade)\b/i.test(command) ||
          /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:format|fmt|codegen|generate|migrate)\b/i.test(command) ||
          /\b(?:prisma|drizzle|typeorm)\s+(?:generate|migrate)\b/i.test(command)
        const owned = (task.workOrder.globalCommands ?? []).some((item) => item.trim().replace(/\s+/g, ' ') === command)
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

  private ensureSubagentDescriptor(agent: Agent, runId: string, slot: ChildSlot): void {
    if (agent.session.events.some((event) => event.type === 'subagent/descriptor')) return
    agent.session.append('subagent/descriptor', snapshotSubagentDescriptor({
      mode: 'continuable',
      provider: 'dungeon-party',
      label: `${runId} · ${slot}`,
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
      this.ensureSubagentDescriptor(live, runId, slot)
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
    this.ensureSubagentDescriptor(handle.agent, runId, slot)
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
    this.ensureSubagentDescriptor(handle.agent, runId, slot)
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
