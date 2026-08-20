import { describe, expect, it } from 'vitest'

import { DungeonService, type DungeonEvent, type WorkOrder } from '../src/service/dungeon-service.js'

function harness() {
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
    config: {
      progressCheckpointIntervalMs: 10_000,
      checkpointResponseTimeoutMs: 5_000,
      maxMissedCheckpoints: 1,
      taskLeaseDurationMs: 20_000,
    },
  })
  const tank = { sessionId: 'tank' }
  service.startRun({ runId: 'run', objective: 'Build', workspaceRoot: '/workspace', workspaceFingerprint: 'v1', tankSessionId: 'tank' })
  service.bindMember(tank, 'run', 'healer', 'healer')
  service.bindMember(tank, 'run', 'dps-1', 'dps-1')
  service.bindMember(tank, 'run', 'dps-2', 'dps-2')
  service.changePhase(tank, 'run', 'PLANNING')
  const order: WorkOrder = {
    id: 'task', runId: 'run', title: 'Task', objective: 'Do it', inputs: [], constraints: [],
    acceptanceCriteria: [{ id: 'task:done', description: 'Done', required: true }],
    readScopes: ['src/**'], writeScopes: ['src/**'], blockedBy: [], expectedArtifacts: [],
    priority: 'normal', required: true, version: 1,
  }
  service.createTask(tank, 'run', order)
  service.changePhase(tank, 'run', 'EXECUTING')
  service.assignTask(tank, 'run', 'task', 'dps-1')
  const lease = service.claimTask({ sessionId: 'dps-1' }, 'run', 'task')
  service.registerTaskTurn('run', 'task', 'turn-1')
  now += 15_001
  service.evaluateTaskProgress('run', 'task', {})
  return { service, events, lease, tank }
}

describe('safe interrupt and reassignment', () => {
  it('requires the exact active turn and confirmed termination before reassignment', () => {
    const { service, tank } = harness()

    expect(() => service.requestTaskInterrupt(tank, 'run', 'task', 'wrong-turn')).toThrowError(
      expect.objectContaining({ code: 'TURN_ID_MISMATCH' }),
    )
    service.requestTaskInterrupt(tank, 'run', 'task', 'turn-1')
    expect(() => service.reassignTask(tank, 'run', 'task', 'dps-2')).toThrowError(
      expect.objectContaining({ code: 'INTERRUPT_NOT_CONFIRMED' }),
    )

    service.completeTaskInterrupt('run', 'task', 'turn-1', { success: true, quarantinedFiles: [] })
    service.reassignTask(tank, 'run', 'task', 'dps-2')
    expect(service.getRun('run').tasks.task).toMatchObject({ ownerSlot: 'dps-2', status: 'ready' })
  })

  it('revokes the old lease, rejects its late report, and quarantines racing writes', () => {
    const { service, tank, lease, events } = harness()
    service.requestTaskInterrupt(tank, 'run', 'task', 'turn-1')
    service.completeTaskInterrupt('run', 'task', 'turn-1', {
      success: true,
      quarantinedFiles: ['src/race.ts'],
    })

    expect(() => service.reassignTask(tank, 'run', 'task', 'dps-2')).toThrowError(
      expect.objectContaining({ code: 'QUARANTINE_REVIEW_REQUIRED' }),
    )
    expect(() => service.submitExecution({ sessionId: 'dps-1' }, 'run', {
      taskId: 'task', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1', generation: 1, status: 'completed', summary: 'late', changedFiles: [],
      evidence: ['late'], commandsRun: [], risks: [], remainingWork: [],
    })).toThrowError(expect.objectContaining({ code: 'STALE_LEASE' }))

    service.reviewQuarantinedChanges(tank, 'run', 'task')
    service.reassignTask(tank, 'run', 'task', 'dps-2')
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'dungeon/task-interrupt-requested',
      'dungeon/task-interrupt-completed',
      'dungeon/task-lease-revoked',
      'dungeon/workspace-changes-quarantined',
      'dungeon/task-owner-reassigned',
    ]))
  })

  it('keeps the task non-reassignable when runtime termination fails', () => {
    const { service, tank } = harness()
    service.requestTaskInterrupt(tank, 'run', 'task', 'turn-1')
    service.completeTaskInterrupt('run', 'task', 'turn-1', { success: false, quarantinedFiles: [] })

    expect(() => service.reassignTask(tank, 'run', 'task', 'dps-2')).toThrowError(
      expect.objectContaining({ code: 'INTERRUPT_NOT_CONFIRMED' }),
    )
    expect(service.getRun('run').tasks.task?.interruptState).toBe('failed')
  })
})
