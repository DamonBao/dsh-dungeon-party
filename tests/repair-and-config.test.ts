import { describe, expect, it } from 'vitest'

import {
  DungeonService,
  resolveDungeonConfig,
  type DungeonEvent,
  type WorkOrder,
} from '../src/service/dungeon-service.js'

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
  service.submitExecution(dps, 'run', {
    taskId: 'task',
    taskVersion: 1,
    leaseId: lease.leaseId,
    leaseVersion: lease.version,
    slot: 'dps-1',
    generation: 1,
    status: 'completed',
    summary: 'implemented',
    changedFiles: ['src/index.ts'],
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
})
