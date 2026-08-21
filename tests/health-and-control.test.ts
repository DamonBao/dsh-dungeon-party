import { describe, expect, it } from 'vitest'

import { DungeonService, type DungeonEvent, type WorkOrder } from '../src/service/dungeon-service.js'

function harness(config = {}) {
  let id = 0
  let now = Date.parse('2025-01-01T00:00:00.000Z')
  const events: DungeonEvent[] = []
  const service = new DungeonService({
    eventStore: {
      append: (event) => events.push(structuredClone(event)),
      load: (runId) => events.filter((event) => event.runId === runId).map((event) => structuredClone(event)),
    },
    idGenerator: () => `id-${++id}`,
    clock: () => new Date(now).toISOString(),
    config,
  })
  return {
    service,
    events,
    advance(ms: number) {
      now += ms
    },
  }
}

const tank = { sessionId: 'tank' }
const healer = { sessionId: 'healer' }
const dps = { sessionId: 'dps' }

function workOrder(): WorkOrder {
  return {
    id: 'task',
    runId: 'run',
    title: 'Execute',
    objective: 'Execute task',
    inputs: [],
    constraints: [],
    acceptanceCriteria: [{ id: 'task:done', description: 'Done', required: true }],
    readScopes: ['src/**'],
    writeScopes: ['src/**'],
    blockedBy: [],
    expectedArtifacts: [],
    priority: 'normal',
    required: true,
    version: 1,
  }
}

function assignedParty(service: DungeonService) {
  service.startRun({
    runId: 'run',
    objective: 'Build',
    workspaceRoot: '/workspace',
    workspaceFingerprint: 'v1',
    tankSessionId: tank.sessionId,
  })
  service.bindMember(tank, 'run', 'healer', healer.sessionId)
  service.bindMember(tank, 'run', 'dps-1', dps.sessionId)
  service.changePhase(tank, 'run', 'PLANNING')
  service.createTask(tank, 'run', workOrder())
  service.changePhase(tank, 'run', 'EXECUTING')
  service.assignTask(tank, 'run', 'task', 'dps-1')
}

function executingParty(service: DungeonService) {
  assignedParty(service)
  return service.claimTask(dps, 'run', 'task')
}

describe('auditable member readiness', () => {
  it('degrades only after enough objective warning signals in the window', () => {
    const { service } = harness({ readinessWarningSignalCount: 2 })
    executingParty(service)

    service.observeHealthSignal('run', {
      slot: 'healer',
      source: 'runtime',
      kind: 'tool-failure',
      severity: 'warning',
      windowMs: 120_000,
      evidence: ['tool call failed'],
    })
    expect(service.getRun('run').slots.healer.readiness).toBe('healthy')

    service.observeHealthSignal('run', {
      slot: 'healer',
      source: 'service',
      kind: 'queue-pressure',
      severity: 'warning',
      windowMs: 120_000,
      evidence: ['four pending actions'],
    })
    expect(service.getRun('run').slots.healer.readiness).toBe('degraded')
  })

  it('marks an objectively unavailable DPS down and revokes its write lease', () => {
    const { service } = harness({ readinessCriticalSignalCount: 2 })
    executingParty(service)
    service.observeAgentTurnEnd('dps', 'error', ['first turn failed'])
    service.observeAgentTurnEnd('dps', 'interrupted', ['driver restarted'])

    const run = service.getRun('run')
    expect(run.slots['dps-1'].lifeState).toBe('down')
    expect(run.tasks.task?.activeLease).toBeUndefined()
    expect(run.tasks.task?.status).toBe('ready')
  })

  it('treats an unexpected Agent disposal as definitive member failure', () => {
    const { service } = harness()
    executingParty(service)

    service.observeAgentDisposed('dps', 'agent disposed')

    const run = service.getRun('run')
    expect(run.slots['dps-1'].lifeState).toBe('down')
    expect(run.tasks.task?.activeLease).toBeUndefined()
  })

  it('issues a resume-only Commander rescue ticket when tank health becomes unavailable', () => {
    const { service } = harness({ readinessCriticalSignalCount: 2 })
    executingParty(service)
    service.observeAgentTurnEnd('tank', 'error', ['first turn failed'])
    service.observeAgentTurnEnd('tank', 'interrupted', ['driver restarted'])

    const run = service.getRun('run')
    expect(run.controlState).toBe('paused')
    expect(run.commanderCheckpoint).toBeDefined()
    expect(run.commanderRescueTickets).toHaveLength(1)
    expect(run.commanderRescueTickets[0]).toMatchObject({ targetSessionId: 'tank', status: 'issued' })
  })

  it('lets the original Commander continue after a transient network wipe', () => {
    const { service } = harness({ readinessCriticalSignalCount: 2 })
    executingParty(service)
    service.observeAgentTurnEnd('tank', 'error', ['network disconnected'])
    service.observeAgentTurnEnd('tank', 'interrupted', ['driver stopped'])

    const recovered = service.recoverRunAfterCommanderReturn(tank, 'run')

    expect(recovered).toMatchObject({ controlState: 'normal', commanderLoad: 'normal' })
    expect(recovered.slots.tank).toMatchObject({ lifeState: 'alive', readiness: 'healthy' })
    expect(recovered.commanderRescueTickets[0]).toMatchObject({ status: 'completed' })
    expect(recovered.commanderBattleResChargesRemaining).toBe(1)
  })

  it('allows only the tank to direct healer self-maintenance', () => {
    const { service } = harness({ readinessWarningSignalCount: 1 })
    executingParty(service)
    service.observeHealthSignal('run', {
      slot: 'healer',
      source: 'runtime',
      kind: 'context-pressure',
      severity: 'warning',
      windowMs: 120_000,
      evidence: ['host reported pressure'],
    })

    expect(() => service.directValidatorMaintenance(dps, 'run')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
    const instruction = service.directValidatorMaintenance(tank, 'run')
    expect(instruction).toMatchObject({ slot: 'healer', action: 'validator-maintenance', status: 'issued' })
    expect(service.getRun('run').slots.healer.readiness).toBe('recovering')

    expect(() => service.completeValidatorMaintenance(dps, 'run', instruction.instructionId, true)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
    service.completeValidatorMaintenance(healer, 'run', instruction.instructionId, true)
    expect(service.getRun('run').slots.healer.readiness).toBe('healthy')
  })
})

describe('checkpoint-based stall detection', () => {
  it('rejects checkpoint and execution submissions after lease expiry', () => {
    const { service, advance } = harness()
    const lease = executingParty(service)
    advance(600_001)

    expect(() => service.submitCheckpoint(dps, 'run', {
      checkpointId: 'late-checkpoint', taskId: 'task', taskVersion: 1,
      leaseId: lease.leaseId, leaseVersion: lease.version, slot: 'dps-1',
      completed: [], nextSteps: [], evidenceDelta: ['late'], blockers: [], workspaceFingerprint: 'v1',
    })).toThrowError(expect.objectContaining({ code: 'LEASE_EXPIRED' }))
    expect(() => service.submitExecution(dps, 'run', {
      taskId: 'task', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1', generation: 1, status: 'completed', summary: 'late', changedFiles: [],
      evidence: ['late'], commandsRun: [], risks: [], remainingWork: [],
    })).toThrowError(expect.objectContaining({ code: 'LEASE_EXPIRED' }))
  })

  it('does not flag a registered long task, then requires consecutive missed windows', () => {
    const { service, advance } = harness({
      progressCheckpointIntervalMs: 10_000,
      checkpointResponseTimeoutMs: 5_000,
      maxMissedCheckpoints: 2,
      taskLeaseDurationMs: 40_000,
    })
    executingParty(service)

    advance(15_001)
    expect(service.evaluateTaskProgress('run', 'task', { hasActiveLongTask: true }).progressState).toBe('on-track')
    expect(service.evaluateTaskProgress('run', 'task', {}).progressState).toBe('suspected-stalled')

    advance(15_001)
    expect(service.evaluateTaskProgress('run', 'task', {}).progressState).toBe('stalled')
  })

  it('accepts a lease-bound checkpoint and restores on-track progress', () => {
    const { service, advance } = harness({
      progressCheckpointIntervalMs: 10_000,
      checkpointResponseTimeoutMs: 5_000,
      maxMissedCheckpoints: 2,
      taskLeaseDurationMs: 40_000,
    })
    const lease = executingParty(service)
    advance(15_001)
    service.evaluateTaskProgress('run', 'task', {})
    const request = service.requestTaskCheckpoint(tank, 'run', 'task')
    expect(request.status).toBe('issued')

    service.submitCheckpoint(dps, 'run', {
      checkpointId: 'checkpoint',
      taskId: 'task',
      taskVersion: 1,
      leaseId: lease.leaseId,
      leaseVersion: lease.version,
      slot: 'dps-1',
      completed: ['implementation'],
      nextSteps: ['tests'],
      evidenceDelta: ['src/index.ts changed'],
      blockers: [],
      workspaceFingerprint: 'v1',
    })

    expect(service.getRun('run').tasks.task?.progressState).toBe('on-track')
    expect(service.getRun('run').tasks.task?.missedCheckpoints).toBe(0)
    expect(service.getRun('run').checkpointRequests.find((item) => item.requestId === request.requestId)?.status).toBe('completed')
  })
})

describe('commander backpressure', () => {
  it('throttles dispatch and persists a commander checkpoint when overloaded', () => {
    const { service, events } = harness({ commanderMaxPendingDecisions: 2, commanderDecisionSlaMs: 10_000 })
    executingParty(service)

    service.observeCommanderLoad('run', {
      pendingDecisionIds: ['decision-1', 'decision-2'],
      oldestDecisionAgeMs: 10_001,
    })

    const run = service.getRun('run')
    expect(run.commanderLoad).toBe('overloaded')
    expect(run.controlState).toBe('throttled')
    expect(run.commanderCheckpoint).toMatchObject({ pendingDecisionIds: ['decision-1', 'decision-2'] })
    expect(events.map((event) => event.type)).toContain('dungeon/commander-checkpointed')
  })

  it('resumes throttled dispatch back to normal', () => {
    const { service } = harness({ commanderMaxPendingDecisions: 2, commanderDecisionSlaMs: 10_000 })
    executingParty(service)
    service.observeCommanderLoad('run', {
      pendingDecisionIds: ['decision-1', 'decision-2'],
      oldestDecisionAgeMs: 10_001,
    })
    expect(service.getRun('run').controlState).toBe('throttled')

    const resumed = service.resumeDispatch(tank, 'run')
    expect(resumed).toMatchObject({ controlState: 'normal', commanderLoad: 'normal' })
  })
})

describe('healer failure freeze', () => {
  it('marks the healer unavailable, pauses dispatch, and blocks new write leases', () => {
    const { service, events } = harness()
    assignedParty(service)

    service.observeAgentDisposed(healer.sessionId, 'agent disposed')

    const run = service.getRun('run')
    expect(run.slots.healer.readiness).toBe('unavailable')
    expect(run.controlState).toBe('paused')
    const pauseEvent = events.find((event) => event.type === 'dungeon/dispatch-paused')
    expect(pauseEvent?.payload).toEqual({ reason: 'healer-unavailable' })
    expect(() => service.claimTask(dps, 'run', 'task')).toThrowError(
      expect.objectContaining({ code: 'DISPATCH_BLOCKED' }),
    )
  })

  it('resumes a healer-caused pause only after the healer recovers and the tank is alive', () => {
    const { service } = harness()
    assignedParty(service)
    service.observeAgentDisposed(healer.sessionId, 'agent disposed')

    expect(() => service.resumeDispatch(tank, 'run')).toThrowError(
      expect.objectContaining({ code: 'HEALER_NOT_RECOVERED' }),
    )

    // The relaunched healer session first reports only warning-level signals,
    // which degrades its readiness, then completes tank-directed maintenance.
    for (const kind of ['tool-failure', 'queue-pressure'] as const) {
      service.observeHealthSignal('run', {
        slot: 'healer',
        source: 'runtime',
        kind,
        severity: 'warning',
        windowMs: 120_000,
        evidence: [kind],
      })
    }
    expect(service.getRun('run').slots.healer.readiness).toBe('degraded')
    const maintenance = service.directValidatorMaintenance(tank, 'run')
    service.completeValidatorMaintenance(healer, 'run', maintenance.instructionId, true)
    expect(service.getRun('run').slots.healer.readiness).toBe('healthy')

    const resumed = service.resumeDispatch(tank, 'run')
    expect(resumed.controlState).toBe('normal')
    expect(() => service.claimTask(dps, 'run', 'task')).not.toThrow()
  })

  it('keeps a healer-caused pause when the Commander returns, while the tank itself recovers', () => {
    const { service } = harness()
    assignedParty(service)
    service.observeAgentDisposed(healer.sessionId, 'healer agent disposed')
    service.observeAgentDisposed(tank.sessionId, 'tank agent disposed')
    expect(service.getRun('run').controlState).toBe('paused')

    const recovered = service.recoverRunAfterCommanderReturn(tank, 'run')

    expect(recovered.controlState).toBe('paused')
    expect(recovered.slots.tank).toMatchObject({ lifeState: 'alive', readiness: 'healthy' })
    expect(recovered.commanderRescueTickets[0]).toMatchObject({ status: 'completed' })
    expect(() => service.resumeDispatch(tank, 'run')).toThrowError(
      expect.objectContaining({ code: 'HEALER_NOT_RECOVERED' }),
    )
  })
})
