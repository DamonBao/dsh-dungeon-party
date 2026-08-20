import { describe, expect, it } from 'vitest'

import {
  DungeonError,
  DungeonService,
  type DungeonConfig,
  type DungeonEvent,
  type WorkOrder,
} from '../src/service/dungeon-service.js'

const tank = { sessionId: 'session-tank' }
const healer = { sessionId: 'session-healer' }
const dps1 = { sessionId: 'session-dps-1' }
const outsider = { sessionId: 'session-outsider' }

function task(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'task-1',
    runId: 'run-1',
    title: 'Implement core',
    objective: 'Implement the core behavior',
    inputs: [],
    constraints: [],
    acceptanceCriteria: [
      { id: 'task-1:works', description: 'Core behavior works', required: true },
    ],
    readScopes: ['src/**'],
    writeScopes: ['src/core/**'],
    blockedBy: [],
    expectedArtifacts: ['src/core/index.ts'],
    priority: 'high',
    required: true,
    version: 1,
    ...overrides,
  }
}

function setup(config: Partial<DungeonConfig> = {}) {
  let id = 0
  let tick = 0
  const persisted: DungeonEvent[] = []
  const service = new DungeonService({
    eventStore: {
      append(event) {
        persisted.push(structuredClone(event))
      },
      load(runId) {
        return persisted.filter((event) => event.runId === runId).map((event) => structuredClone(event))
      },
    },
    idGenerator: () => `id-${++id}`,
    clock: () => new Date(Date.UTC(2025, 0, 1, 0, 0, tick++)).toISOString(),
    config,
  })

  return { service, persisted }
}

function createReadyRun(service: DungeonService) {
  const run = service.startRun({
    runId: 'run-1',
    objective: 'Build a reliable core',
    workspaceRoot: '/workspace',
    workspaceFingerprint: 'fingerprint-v1',
    tankSessionId: tank.sessionId,
  })
  service.bindMember(tank, run.id, 'healer', healer.sessionId)
  service.bindMember(tank, run.id, 'dps-1', dps1.sessionId)
  service.changePhase(tank, run.id, 'PLANNING')
  service.createTask(tank, run.id, task())
  service.changePhase(tank, run.id, 'EXECUTING')
  return run
}

describe('DungeonService', () => {
  it('creates five stable slots and persists reconstructable events', () => {
    const { service, persisted } = setup()

    const run = service.startRun({
      runId: 'run-1',
      objective: 'Build a reliable core',
      workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1',
      tankSessionId: tank.sessionId,
    })

    expect(run.phase).toBe('FORMING')
    expect(run.controlState).toBe('normal')
    expect(run.scopeEnforcementMode).toBe('aggregate')
    expect(Object.keys(run.slots)).toEqual(['tank', 'dps-1', 'dps-2', 'dps-3', 'healer'])
    expect(run.slots.tank).toMatchObject({ currentSessionId: tank.sessionId, generation: 1 })
    expect(run.slots['dps-1']).toMatchObject({ generation: 0, history: [] })
    expect(persisted.map((event) => event.type)).toEqual([
      'dungeon/run-created',
      'dungeon/member-bound',
    ])
    expect(persisted.map((event) => event.sequence)).toEqual([1, 2])
    expect(service.startRun({
      runId: 'run-1', objective: 'Build a reliable core', workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })).toEqual(run)
    expect(persisted).toHaveLength(2)
    expect(() => service.startRun({
      runId: 'run-1', objective: 'Different', workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }))

    const recovered = service.recoverRun(run.id)
    expect(recovered).toEqual(run)
  })

  it('waits from an event cursor and returns only newer durable events', async () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })

    const result = await service.waitForChange(tank, run.id, 1, 1_000)

    expect(result.timedOut).toBe(false)
    expect(result.events.map((event) => event.sequence)).toEqual([2])
  })

  it('uses bound session identity instead of a caller supplied role', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1',
      objective: 'Build a reliable core',
      workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1',
      tankSessionId: tank.sessionId,
    })

    expect(() => service.changePhase(outsider, run.id, 'PLANNING')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
  })

  it('rejects unsafe work orders and overlapping parallel write scopes', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1',
      objective: 'Build a reliable core',
      workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1',
      tankSessionId: tank.sessionId,
    })
    service.changePhase(tank, run.id, 'PLANNING')

    expect(() =>
      service.createTask(tank, run.id, task({ writeScopes: ['../outside/**'] })),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SCOPE' }))

    service.createTask(tank, run.id, task())
    expect(() =>
      service.createTask(
        tank,
        run.id,
        task({
          id: 'task-2',
          acceptanceCriteria: [
            { id: 'task-2:works', description: 'Second task works', required: true },
          ],
          writeScopes: ['src/core/parser/**'],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'WRITE_SCOPE_CONFLICT' }))
  })

  it('allows each workspace-global command to belong to only one work order', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })
    service.changePhase(tank, run.id, 'PLANNING')
    service.createTask(tank, run.id, { ...task(), globalCommands: ['npm install'] })

    expect(() => service.createTask(tank, run.id, {
      ...task({ id: 'task-2', writeScopes: ['tests/**'], acceptanceCriteria: [
        { id: 'task-2:works', description: 'Second works', required: true },
      ] }),
      globalCommands: ['npm install'],
    })).toThrowError(expect.objectContaining({ code: 'GLOBAL_COMMAND_CONFLICT' }))
  })

  it('allows overlapping write scopes when the dependency DAG makes tasks serial', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })
    service.changePhase(tank, run.id, 'PLANNING')
    const firstTask = task()
    service.createTask(tank, run.id, firstTask)
    service.createTask(tank, run.id, firstTask)
    expect(service.getRun(run.id).taskSetVersion).toBe(1)

    expect(() => service.createTask(tank, run.id, task({
      id: 'task-2',
      blockedBy: ['task-1'],
      acceptanceCriteria: [{ id: 'task-2:works', description: 'Second works', required: true }],
      writeScopes: ['src/core/parser/**'],
    }))).not.toThrow()
  })

  it('serializes write leases when strict scope enforcement has no telemetry', () => {
    const { service } = setup({ strictPerAgentWriteScopes: true })
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, run.id, 'healer', healer.sessionId)
    service.bindMember(tank, run.id, 'dps-1', dps1.sessionId)
    service.bindMember(tank, run.id, 'dps-2', 'session-dps-2')
    service.changePhase(tank, run.id, 'PLANNING')
    service.createTask(tank, run.id, task())
    service.createTask(tank, run.id, task({
      id: 'task-2', writeScopes: ['tests/**'],
      acceptanceCriteria: [{ id: 'task-2:works', description: 'Second works', required: true }],
    }))
    service.changePhase(tank, run.id, 'EXECUTING')
    service.assignTask(tank, run.id, 'task-1', 'dps-1')
    service.assignTask(tank, run.id, 'task-2', 'dps-2')
    service.claimTask(dps1, run.id, 'task-1')

    expect(() => service.claimTask({ sessionId: 'session-dps-2' }, run.id, 'task-2')).toThrowError(
      expect.objectContaining({ code: 'WRITE_DISPATCH_SERIALIZED' }),
    )
  })

  it('enforces maxConcurrentDps when granting leases', () => {
    const { service } = setup({ maxConcurrentDps: 1 })
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, run.id, 'healer', healer.sessionId)
    service.bindMember(tank, run.id, 'dps-1', dps1.sessionId)
    service.bindMember(tank, run.id, 'dps-2', 'session-dps-2')
    service.changePhase(tank, run.id, 'PLANNING')
    service.createTask(tank, run.id, task())
    service.createTask(tank, run.id, task({
      id: 'task-2', writeScopes: ['tests/**'],
      acceptanceCriteria: [{ id: 'task-2:works', description: 'Second works', required: true }],
    }))
    service.changePhase(tank, run.id, 'EXECUTING')
    service.assignTask(tank, run.id, 'task-1', 'dps-1')
    service.assignTask(tank, run.id, 'task-2', 'dps-2')
    service.claimTask(dps1, run.id, 'task-1')

    expect(() => service.claimTask({ sessionId: 'session-dps-2' }, run.id, 'task-2')).toThrowError(
      expect.objectContaining({ code: 'MAX_CONCURRENT_DPS' }),
    )
  })

  it('requires a bound healer before granting the first write lease', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1',
      objective: 'Build a reliable core',
      workspaceRoot: '/workspace',
      workspaceFingerprint: 'fingerprint-v1',
      tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, run.id, 'dps-1', dps1.sessionId)
    service.changePhase(tank, run.id, 'PLANNING')
    service.createTask(tank, run.id, task())

    expect(() => service.changePhase(tank, run.id, 'EXECUTING')).toThrowError(
      expect.objectContaining({ code: 'HEALER_REQUIRED' }),
    )
  })

  it('enforces task dependencies and exact lease identity', () => {
    const { service } = setup()
    const run = createReadyRun(service)
    const assigned = service.assignTask(tank, run.id, 'task-1', 'dps-1')
    expect(service.assignTask(tank, run.id, 'task-1', 'dps-1')).toEqual(assigned)
    const lease = service.claimTask(dps1, run.id, 'task-1')

    expect(() =>
      service.submitExecution(outsider, run.id, {
        taskId: 'task-1',
        taskVersion: 1,
        leaseId: lease.leaseId,
        leaseVersion: lease.version,
        slot: 'dps-1',
        generation: 1,
        status: 'completed',
        summary: 'Done',
        changedFiles: ['src/core/index.ts'],
        evidence: ['unit tests passed'],
        commandsRun: [{ command: 'pnpm test', exitCode: 0, summary: 'passed' }],
        risks: [],
        remainingWork: [],
        workspaceFingerprint: 'fingerprint-v1',
      }),
    ).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }))

    expect(() =>
      service.submitExecution(dps1, run.id, {
        taskId: 'task-1',
        taskVersion: 1,
        leaseId: lease.leaseId,
        leaseVersion: lease.version + 1,
        slot: 'dps-1',
        generation: 1,
        status: 'completed',
        summary: 'Done',
        changedFiles: ['src/core/index.ts'],
        evidence: ['unit tests passed'],
        commandsRun: [],
        risks: [],
        remainingWork: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'STALE_LEASE' }))

    expect(() => service.submitExecution(dps1, run.id, {
      taskId: 'task-1', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1', generation: 1, status: 'completed', summary: 'Unowned global command',
      changedFiles: [], evidence: ['ran install'], commandsRun: [
        { command: 'npm install', exitCode: 0, summary: 'installed' },
      ], risks: [], remainingWork: [],
    })).toThrowError(expect.objectContaining({ code: 'GLOBAL_COMMAND_UNOWNED' }))

    expect(() => service.submitExecution(dps1, run.id, {
      taskId: 'task-1', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1', generation: 1, status: 'completed', summary: 'Escaped scope',
      changedFiles: ['README.md'], evidence: ['unit tests passed'], commandsRun: [], risks: [], remainingWork: [],
    })).toThrowError(expect.objectContaining({ code: 'WRITE_SCOPE_VIOLATION' }))

    const report = {
      taskId: 'task-1', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1' as const, generation: 1, status: 'completed' as const, summary: 'Done',
      changedFiles: ['src/core/index.ts'], evidence: ['unit tests passed'], commandsRun: [], risks: [], remainingWork: [],
    }
    service.submitExecution(dps1, run.id, report)
    service.submitExecution(dps1, run.id, report)
    expect(service.getRun(run.id).tasks['task-1']?.executionReports).toHaveLength(1)
    expect(() => service.submitExecution(dps1, run.id, { ...report, summary: 'Conflicting retry' })).toThrowError(
      expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
    )
  })

  it('rejects incomplete pass reports and completes only the validated workspace version', () => {
    const { service } = setup()
    const run = createReadyRun(service)
    service.assignTask(tank, run.id, 'task-1', 'dps-1')
    const lease = service.claimTask(dps1, run.id, 'task-1')
    service.submitExecution(dps1, run.id, {
      taskId: 'task-1',
      taskVersion: 1,
      leaseId: lease.leaseId,
      leaseVersion: lease.version,
      slot: 'dps-1',
      generation: 1,
      status: 'completed',
      summary: 'Done',
      changedFiles: ['src/core/index.ts'],
      evidence: ['unit tests passed'],
      commandsRun: [{ command: 'pnpm test', exitCode: 0, summary: 'passed' }],
      risks: [],
      remainingWork: [],
      workspaceFingerprint: 'fingerprint-v1',
    })
    service.changePhase(tank, run.id, 'VALIDATING')
    const manifest = service.createValidationManifest(tank, run.id, 'fingerprint-v1')
    expect(service.createValidationManifest(healer, run.id, 'fingerprint-v1')).toEqual(manifest)

    expect(() =>
      service.submitValidation(healer, run.id, {
        validationId: 'validation-1',
        verdict: 'pass',
        taskSetVersion: manifest.taskSetVersion,
        manifestVersion: manifest.manifestVersion,
        workspaceFingerprint: manifest.workspaceFingerprint,
        checks: [],
        findings: [],
        summary: 'Looks good',
      }),
    ).toThrowError(expect.objectContaining({ code: 'INCOMPLETE_VALIDATION' }))

    const validationReport = {
      validationId: 'validation-2',
      verdict: 'pass' as const,
      taskSetVersion: manifest.taskSetVersion,
      manifestVersion: manifest.manifestVersion,
      workspaceFingerprint: manifest.workspaceFingerprint,
      checks: [
        {
          criterionId: 'task-1:works',
          status: 'pass' as const,
          evidence: ['unit tests passed'],
        },
      ],
      findings: [],
      summary: 'All required checks passed',
    }
    service.submitValidation(healer, run.id, validationReport)
    service.submitValidation(healer, run.id, validationReport)
    expect(service.getRun(run.id).validationReports).toHaveLength(1)
    expect(() => service.submitValidation(healer, run.id, {
      ...validationReport,
      summary: 'Conflicting retry',
    })).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }))

    expect(() => service.finishRun(tank, run.id, 'Summary', 'fingerprint-v2')).toThrowError(
      expect.objectContaining({ code: 'STALE_VALIDATION' }),
    )
    for (const kind of ['tool-failure', 'queue-pressure'] as const) {
      service.observeHealthSignal(run.id, {
        slot: 'healer', source: 'runtime', kind, severity: 'warning',
        windowMs: 120_000, evidence: [kind],
      })
    }
    expect(() => service.finishRun(tank, run.id, 'Summary', 'fingerprint-v1')).toThrowError(
      expect.objectContaining({ code: 'MEMBER_NOT_READY' }),
    )
    const maintenance = service.directValidatorMaintenance(tank, run.id)
    service.completeValidatorMaintenance(healer, run.id, maintenance.instructionId, true)
    expect(service.finishRun(tank, run.id, 'Implemented and tested', 'fingerprint-v1').phase).toBe(
      'COMPLETED',
    )
  })

  it('rejects a pass report containing major findings', () => {
    const { service } = setup()
    const run = createReadyRun(service)
    service.assignTask(tank, run.id, 'task-1', 'dps-1')
    const lease = service.claimTask(dps1, run.id, 'task-1')
    service.submitExecution(dps1, run.id, {
      taskId: 'task-1',
      taskVersion: 1,
      leaseId: lease.leaseId,
      leaseVersion: lease.version,
      slot: 'dps-1',
      generation: 1,
      status: 'completed',
      summary: 'Done',
      changedFiles: [],
      evidence: ['done'],
      commandsRun: [],
      risks: [],
      remainingWork: [],
    })
    service.changePhase(tank, run.id, 'VALIDATING')
    const manifest = service.createValidationManifest(tank, run.id, 'fingerprint-v1')
    expect(service.createValidationManifest(healer, run.id, 'fingerprint-v1')).toEqual(manifest)

    expect(() =>
      service.submitValidation(healer, run.id, {
        validationId: 'validation-1',
        verdict: 'pass',
        taskSetVersion: manifest.taskSetVersion,
        manifestVersion: manifest.manifestVersion,
        workspaceFingerprint: manifest.workspaceFingerprint,
        checks: [
          { criterionId: 'task-1:works', status: 'pass', evidence: ['checked'] },
        ],
        findings: [
          {
            id: 'finding-1',
            severity: 'major',
            ownerTaskId: 'task-1',
            title: 'Broken edge case',
            evidence: 'reproduction',
            remediation: 'fix it',
          },
        ],
        summary: 'Pass despite issue',
      }),
    ).toThrowError(expect.objectContaining({ code: 'PASS_HAS_BLOCKING_FINDINGS' }))
  })
})

describe('DungeonError', () => {
  it('exposes a machine-readable code', () => {
    const error = new DungeonError('EXAMPLE', 'example')
    expect(error).toMatchObject({ name: 'DungeonError', code: 'EXAMPLE', message: 'example' })
  })
})
