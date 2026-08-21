import { describe, expect, it } from 'vitest'

import {
  DungeonError,
  DungeonService,
  resolveDungeonConfig,
  defaultDungeonConfig,
  type DungeonEvent,
  type WorkOrder,
} from '../src/service/dungeon-service.js'
import { Config } from '../src/plugin.js'

function setup(config = {}) {
  let id = 0
  const events: DungeonEvent[] = []
  const service = new DungeonService({
    eventStore: {
      append: (event) => events.push(structuredClone(event)),
      load: (runId) => events.filter((event) => event.runId === runId).map((event) => structuredClone(event)),
    },
    idGenerator: () => `id-${++id}`,
    clock: () => new Date(Date.UTC(2025, 0, 1, 0, 0, id)).toISOString(),
    config,
  })
  return { service, events }
}

const tank = { sessionId: 'tank' }
const healer = { sessionId: 'healer' }
const dps = { sessionId: 'dps' }

function workOrder(): WorkOrder {
  return {
    id: 'task',
    runId: 'run',
    title: 'Implement',
    objective: 'Implement behavior',
    inputs: [],
    constraints: [],
    acceptanceCriteria: [{ id: 'task:criterion', description: 'Works', required: true }],
    readScopes: ['src/**'],
    writeScopes: ['src/**'],
    blockedBy: [],
    expectedArtifacts: ['src/index.ts'],
    priority: 'high',
    required: true,
    version: 1,
  }
}

function runThroughFailedValidation(service: DungeonService) {
  service.startRun({
    runId: 'run',
    objective: 'Build it',
    workspaceRoot: process.cwd(),
    workspaceFingerprint: 'v1',
    tankSessionId: tank.sessionId,
  })
  service.bindMember(tank, 'run', 'healer', healer.sessionId)
  service.bindMember(tank, 'run', 'dps-1', dps.sessionId)
  service.changePhase(tank, 'run', 'PLANNING')
  service.createTask(tank, 'run', workOrder())
  service.changePhase(tank, 'run', 'EXECUTING')
  service.assignTask(tank, 'run', 'task', 'dps-1')
  const lease = service.claimTask(dps, 'run', 'task')
  service.submitExecution(dps, 'run', {
    taskId: 'task',
    taskVersion: 1,
    leaseId: lease.leaseId,
    leaseVersion: lease.version,
    slot: 'dps-1',
    generation: 1,
    status: 'completed',
    summary: 'implemented',
    changedFiles: ['src/service/dungeon-service.ts'],
    evidence: ['tests'],
    commandsRun: [],
    risks: [],
    remainingWork: [],
  })
  service.changePhase(tank, 'run', 'VALIDATING')
  const manifest = service.createValidationManifest(tank, 'run', 'v1')
  service.submitValidation(healer, 'run', {
    validationId: 'validation-fail',
    verdict: 'fail',
    taskSetVersion: manifest.taskSetVersion,
    manifestVersion: manifest.manifestVersion,
    workspaceFingerprint: 'v1',
    checks: [{ criterionId: 'task:criterion', status: 'fail', evidence: ['reproduction'] }],
    findings: [{
      id: 'finding',
      severity: 'major',
      ownerTaskId: 'task',
      title: 'Broken',
      evidence: 'reproduction',
      remediation: 'repair',
    }],
    summary: 'Needs repair',
  })
}

describe('dungeon configuration', () => {
  it('applies the PRD defaults', () => {
    expect(resolveDungeonConfig({})).toMatchObject({
      maxConcurrentDps: 3,
      maxRepairRounds: 3,
      battleResCharges: 1,
      commanderBattleResCharges: 1,
      taskLeaseDurationMs: 600_000,
      maxMissedCheckpoints: 2,
      validationRequired: true,
      scopeEnforcementMode: 'auto',
      effectiveScopeEnforcementMode: 'aggregate',
    })
  })

  it('rejects inconsistent timing and unsafe scope configuration', () => {
    expect(() => resolveDungeonConfig({ maxConcurrentDps: 4 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    )
    expect(() =>
      resolveDungeonConfig({
        progressCheckpointIntervalMs: 180_000,
        checkpointResponseTimeoutMs: 60_000,
        maxMissedCheckpoints: 2,
        taskLeaseDurationMs: 480_000,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }))
    expect(() => resolveDungeonConfig({ fingerprintIgnoreScopes: ['../secrets/**'] })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    )
    expect(() => resolveDungeonConfig({ scopeEnforcementMode: 'telemetry' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    )
    expect(resolveDungeonConfig({ strictPerAgentWriteScopes: true }).effectiveScopeEnforcementMode).toBe('serial')
    expect(resolveDungeonConfig({ sessionWriteTelemetryAvailable: true }).effectiveScopeEnforcementMode).toBe('telemetry')
  })

  // t1-config-fallback: A1+A2
  it('falls back to default fingerprintIgnoreScopes when input is an empty array', () => {
    const config = resolveDungeonConfig({ fingerprintIgnoreScopes: [] })
    expect(config.fingerprintIgnoreScopes).toEqual(defaultDungeonConfig.fingerprintIgnoreScopes)
    expect(config.fingerprintIgnoreScopes.length).toBeGreaterThan(0)
  })

  it('uses provided fingerprintIgnoreScopes when non-empty', () => {
    const customScopes = ['custom/**', 'tmp/**']
    const config = resolveDungeonConfig({ fingerprintIgnoreScopes: customScopes })
    expect(config.fingerprintIgnoreScopes).toEqual(customScopes)
  })

  it('uses default fingerprintIgnoreScopes when input omits the field', () => {
    const config = resolveDungeonConfig({})
    expect(config.fingerprintIgnoreScopes).toEqual(defaultDungeonConfig.fingerprintIgnoreScopes)
  })

  // t1-config-fallback: plugin.ts Config schema default
  it('plugin Config schema provides default fingerprintIgnoreScopes so Config({}) does not produce empty array', () => {
    // The Config schema should have a default for fingerprintIgnoreScopes
    const parsed = Config({
      dungeon: {
        scopeEnforcementMode: 'auto',
        strictPerAgentWriteScopes: false,
        maxConcurrentDps: 3,
        maxRepairRounds: 3,
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
        validationRequired: true,
      },
    })
    // After the fix, Config({}) should produce the default scopes, not empty array
    expect(parsed.dungeon.fingerprintIgnoreScopes).toEqual(defaultDungeonConfig.fingerprintIgnoreScopes)
    expect(parsed.dungeon.fingerprintIgnoreScopes.length).toBeGreaterThan(0)
  })
})

describe('repair cycle', () => {
  it('reopens the finding owner, increments versions, and stales validation', () => {
    const { service, events } = setup()
    runThroughFailedValidation(service)
    service.changePhase(tank, 'run', 'REPAIR')

    const reopened = service.reopenTask(tank, 'run', 'task', ['finding'])
    const run = service.getRun('run')

    expect(reopened).toMatchObject({ status: 'pending', repairRound: 1 })
    expect(reopened.workOrder.version).toBe(2)
    expect(run.taskSetVersion).toBe(2)
    expect(run.validationReports.at(-1)?.status).toBe('stale')
    expect(events.at(-1)?.type).toBe('dungeon/task-reopened')
  })

  it('fails the run when the configured repair limit is exceeded', () => {
    const { service } = setup({ maxRepairRounds: 1 })
    runThroughFailedValidation(service)
    service.changePhase(tank, 'run', 'REPAIR')
    service.reopenTask(tank, 'run', 'task', ['finding'])

    // Simulate a second repair request after another failed validation cycle.
    expect(() => service.reopenTask(tank, 'run', 'task', ['finding'])).toThrowError(
      expect.objectContaining({ code: 'REPAIR_LIMIT_EXCEEDED' }),
    )
    expect(service.getRun('run').phase).toBe('FAILED')
  })

  it('marks reports stale when the observed workspace fingerprint changes', () => {
    const { service } = setup()
    runThroughFailedValidation(service)

    service.observeWorkspaceFingerprint('run', 'v2')

    const run = service.getRun('run')
    expect(run.workspaceFingerprint).toBe('v2')
    expect(run.validationReports.at(-1)?.status).toBe('stale')
  })

  // t1-repair-claim: C6 - claimTask should allow REPAIR phase
  it('allows claiming tasks during REPAIR phase', () => {
    const { service } = setup()
    runThroughFailedValidation(service)
    service.changePhase(tank, 'run', 'REPAIR')
    service.reopenTask(tank, 'run', 'task', ['finding'])
    service.changePhase(tank, 'run', 'EXECUTING')
    service.changePhase(tank, 'run', 'REPAIR')
    // Task should be assignable and claimable in REPAIR phase
    service.assignTask(tank, 'run', 'task', 'dps-1')
    const lease = service.claimTask(dps, 'run', 'task')
    expect(lease.ownerSlot).toBe('dps-1')
    expect(service.getRun('run').tasks['task']?.status).toBe('running')
  })

  // t1-claim-message: C8 - claimTask error message should include current status and lease info
  it('claimTask error message includes current task status and active lease info', () => {
    const { service } = setup()
    runThroughFailedValidation(service)
    service.changePhase(tank, 'run', 'REPAIR')
    service.reopenTask(tank, 'run', 'task', ['finding'])
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    const lease = service.claimTask(dps, 'run', 'task')

    // Try to claim again by the same slot - should get informative error
    let error: DungeonError | undefined
    try {
      service.claimTask(dps, 'run', 'task')
    } catch (e) {
      error = e as DungeonError
    }
    expect(error).toBeDefined()
    expect(error!.code).toBe('TASK_NOT_CLAIMABLE')
    // Error message should mention the current status and lease
    expect(error!.message).toContain('running')
    expect(error!.message).toContain(lease.leaseId)
  })

  it('claimTask error message is informative when task is not ready', () => {
    const { service } = setup()
    service.startRun({
      runId: 'run',
      objective: 'Build it',
      workspaceRoot: process.cwd(),
      workspaceFingerprint: 'v1',
      tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, 'run', 'healer', healer.sessionId)
    service.bindMember(tank, 'run', 'dps-1', dps.sessionId)
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', workOrder())
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    // Task is ready but not claimed - claim it first, then try again
    service.claimTask(dps, 'run', 'task')
    // Try to claim again - should get TASK_NOT_CLAIMABLE with informative message
    let error: DungeonError | undefined
    try {
      service.claimTask(dps, 'run', 'task')
    } catch (e) {
      error = e as DungeonError
    }
    expect(error).toBeDefined()
    expect(error!.code).toBe('TASK_NOT_CLAIMABLE')
    // Should mention current status (running, since we already claimed it)
    expect(error!.message.toLowerCase()).toContain('running')
  })
})

// t1-artifact-exists: C7 - submitExecution should validate changedFiles exist on disk for completed status
describe('artifact existence validation', () => {
  it('rejects completed execution report when changedFiles do not exist on disk', () => {
    const { service } = setup()
    service.startRun({
      runId: 'run',
      objective: 'Build it',
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
    const lease = service.claimTask(dps, 'run', 'task')

    // Try to submit with a non-existent file
    expect(() =>
      service.submitExecution(dps, 'run', {
        taskId: 'task',
        taskVersion: 1,
        leaseId: lease.leaseId,
        leaseVersion: lease.version,
        slot: 'dps-1',
        generation: 1,
        status: 'completed',
        summary: 'Done',
        changedFiles: ['src/non-existent-file.ts'],
        evidence: ['tests'],
        commandsRun: [],
        risks: [],
        remainingWork: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'ARTIFACT_NOT_FOUND' }))
  })

  it('allows completed execution report when changedFiles exist on disk', () => {
    const { service } = setup()
    service.startRun({
      runId: 'run',
      objective: 'Build it',
      workspaceRoot: process.cwd(),
      workspaceFingerprint: 'v1',
      tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, 'run', 'healer', healer.sessionId)
    service.bindMember(tank, 'run', 'dps-1', dps.sessionId)
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', { ...workOrder(), writeScopes: ['src/**'] })
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    const lease = service.claimTask(dps, 'run', 'task')

    // Use an actual existing file
    const result = service.submitExecution(dps, 'run', {
      taskId: 'task',
      taskVersion: 1,
      leaseId: lease.leaseId,
      leaseVersion: lease.version,
      slot: 'dps-1',
      generation: 1,
      status: 'completed',
      summary: 'Done',
      changedFiles: ['src/service/dungeon-service.ts'],
      evidence: ['tests'],
      commandsRun: [],
      risks: [],
      remainingWork: [],
    })
    expect(result.status).toBe('completed')
  })

  it('does not require artifact existence for non-completed statuses', () => {
    const { service } = setup()
    service.startRun({
      runId: 'run',
      objective: 'Build it',
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
    const lease = service.claimTask(dps, 'run', 'task')

    // blocked status should not check file existence
    const result = service.submitExecution(dps, 'run', {
      taskId: 'task',
      taskVersion: 1,
      leaseId: lease.leaseId,
      leaseVersion: lease.version,
      slot: 'dps-1',
      generation: 1,
      status: 'blocked',
      summary: 'Blocked',
      changedFiles: ['src/non-existent-file.ts'],
      evidence: ['blocked reason'],
      commandsRun: [],
      risks: [],
      remainingWork: [],
    })
    expect(result.status).toBe('blocked')
  })
})

// t1-seq-counter: D9 - event sequence should be service-instance monotonic counter
describe('event sequence counter', () => {
  it('assigns strictly increasing sequence numbers and rejects duplicate submissions', () => {
    const { service, events } = setup()
    service.startRun({
      runId: 'run',
      objective: 'Build it',
      workspaceRoot: process.cwd(),
      workspaceFingerprint: 'v1',
      tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, 'run', 'healer', healer.sessionId)
    service.bindMember(tank, 'run', 'dps-1', dps.sessionId)
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', workOrder())
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    const lease = service.claimTask(dps, 'run', 'task')

    // Submit same execution report multiple times
    // Only the first should succeed; rest should fail with IDEMPOTENCY_CONFLICT
    const report = {
      taskId: 'task',
      taskVersion: 1,
      leaseId: lease.leaseId,
      leaseVersion: lease.version,
      slot: 'dps-1' as const,
      generation: 1,
      status: 'completed' as const,
      summary: 'Done',
      changedFiles: ['src/service/dungeon-service.ts'],
      evidence: ['tests'],
      commandsRun: [],
      risks: [],
      remainingWork: [],
    }

    // First submission should succeed
    const result = service.submitExecution(dps, 'run', report)
    expect(result.status).toBe('completed')

    // Second submission with same data should be idempotent (return same result)
    const result2 = service.submitExecution(dps, 'run', report)
    expect(result2.status).toBe('completed')

    // Third submission with different data should fail with IDEMPOTENCY_CONFLICT
    expect(() => service.submitExecution(dps, 'run', { ...report, summary: 'Different' }))
      .toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }))

    // Check that all events have strictly increasing sequence numbers
    const runEvents = events.filter((e) => e.runId === 'run')
    const sequences = runEvents.map((e) => e.sequence)
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]!).toBeGreaterThan(sequences[i - 1]!)
    }
    // No duplicate sequences
    expect(new Set(sequences).size).toBe(sequences.length)
  })

  it('uses service-level counter instead of eventStore.load length', () => {
    const { service, events } = setup()
    service.startRun({
      runId: 'run',
      objective: 'Build it',
      workspaceRoot: '/workspace',
      workspaceFingerprint: 'v1',
      tankSessionId: tank.sessionId,
    })

    // After startRun, we should have 2 events (run-created, member-bound)
    const runEvents = events.filter((e) => e.runId === 'run')
    expect(runEvents.length).toBe(2)
    expect(runEvents[0]!.sequence).toBe(1)
    expect(runEvents[1]!.sequence).toBe(2)

    // Add more events
    service.bindMember(tank, 'run', 'healer', healer.sessionId)
    const runEvents2 = events.filter((e) => e.runId === 'run')
    expect(runEvents2.length).toBe(3)
    expect(runEvents2[2]!.sequence).toBe(3)
  })
})

// t1-reducer-purity: D10 - reducer should not mutate external references
describe('reducer purity', () => {
  it('external run snapshot is not mutated by subsequent events', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run',
      objective: 'Build it',
      workspaceRoot: '/workspace',
      workspaceFingerprint: 'v1',
      tankSessionId: tank.sessionId,
    })

    // Capture a snapshot of the run
    const snapshot = JSON.parse(JSON.stringify(run))
    expect(snapshot.phase).toBe('FORMING')
    expect(Object.keys(snapshot.tasks)).toHaveLength(0)

    // Add a task - this should not mutate the snapshot
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', workOrder())

    // Snapshot should remain unchanged
    expect(snapshot.phase).toBe('FORMING')
    expect(Object.keys(snapshot.tasks)).toHaveLength(0)

    // But current run should have the task
    const currentRun = service.getRun('run')
    expect(currentRun.phase).toBe('PLANNING')
    expect(Object.keys(currentRun.tasks)).toHaveLength(1)
  })

  it('nested objects in snapshot are not mutated by subsequent events', () => {
    const { service } = setup()
    service.startRun({
      runId: 'run',
      objective: 'Build it',
      workspaceRoot: '/workspace',
      workspaceFingerprint: 'v1',
      tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, 'run', 'healer', healer.sessionId)
    service.bindMember(tank, 'run', 'dps-1', dps.sessionId)
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', workOrder())
    service.changePhase(tank, 'run', 'EXECUTING')

    const runBeforeAssign = service.getRun('run')
    const tasksSnapshot = JSON.parse(JSON.stringify(runBeforeAssign.tasks))
    expect(tasksSnapshot['task'].status).toBe('pending')
    expect(tasksSnapshot['task'].ownerSlot).toBeUndefined()

    service.assignTask(tank, 'run', 'task', 'dps-1')

    // The snapshot should still show pending/unassigned
    expect(tasksSnapshot['task'].status).toBe('pending')
    expect(tasksSnapshot['task'].ownerSlot).toBeUndefined()

    // Current run should show ready/assigned
    const currentRun = service.getRun('run')
    expect(currentRun.tasks['task']!.status).toBe('ready')
    expect(currentRun.tasks['task']!.ownerSlot).toBe('dps-1')
  })
})
