import { describe, expect, it } from 'vitest'

import {
  createReadableRunId,
  DungeonError,
  DungeonService,
  type DungeonConfig,
  type DungeonEvent,
  type ValidationManifest,
  type ValidationSubmission,
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
    writeScopes: ['src/service/**'],
    blockedBy: [],
    expectedArtifacts: ['src/service/dungeon-service.ts'],
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
    workspaceRoot: process.cwd(),
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

function validatingRun(service: DungeonService): ValidationManifest {
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
    changedFiles: ['src/service/dungeon-service.ts'],
    evidence: ['unit tests passed'],
    commandsRun: [],
    risks: [],
    remainingWork: [],
  })
  service.changePhase(tank, run.id, 'VALIDATING')
  return service.createValidationManifest(tank, run.id, 'fingerprint-v1')
}

function setupWithMutableClock() {
  let now = Date.parse('2025-01-01T00:00:00.000Z')
  let id = 0
  const persisted: DungeonEvent[] = []
  const service = new DungeonService({
    eventStore: {
      append(event) { persisted.push(structuredClone(event)) },
      load(runId) { return persisted.filter((event) => event.runId === runId).map((event) => structuredClone(event)) },
    },
    idGenerator: () => `id-${++id}`,
    clock: () => new Date(now).toISOString(),
  })
  const run = service.startRun({
    runId: 'run-1', objective: 'Build', workspaceRoot: process.cwd(),
    workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
  })
  service.bindMember(tank, run.id, 'healer', healer.sessionId)
  service.bindMember(tank, run.id, 'dps-1', dps1.sessionId)
  service.changePhase(tank, run.id, 'PLANNING')
  service.createTask(tank, run.id, task())
  service.changePhase(tank, run.id, 'EXECUTING')
  service.assignTask(tank, run.id, 'task-1', 'dps-1')
  const lease = service.claimTask(dps1, run.id, 'task-1')
  return {
    service, run, lease,
    advance: (ms: number) => { now += ms },
  }
}

describe('submit window protection', () => {
  const completedReport = (lease: { leaseId: string; version: number }) => ({
    taskId: 'task-1', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
    slot: 'dps-1' as const, generation: 1, status: 'completed' as const, summary: 'Done',
    changedFiles: [] as string[], evidence: ['done'], commandsRun: [], risks: [], remainingWork: [],
  })

  it('keeps a lease alive against sweep and submit while a submit window is open', () => {
    const { service, run, lease, advance } = setupWithMutableClock()

    service.protectSubmit(run.id, 'task-1')
    advance(620_000) // past the 10 minute lease duration, inside the window
    service.sweepExpiredState(run.id)

    expect(service.getRun(run.id).tasks['task-1']!.activeLease).toBeDefined()
    service.submitExecution(dps1, run.id, completedReport(lease))
    expect(service.getRun(run.id).tasks['task-1']!.status).toBe('completed')
  })

  it('revokes an expired lease again once the submit window is released', () => {
    const { service, run, lease, advance } = setupWithMutableClock()

    service.protectSubmit(run.id, 'task-1')
    advance(620_000)
    service.sweepExpiredState(run.id)
    expect(service.getRun(run.id).tasks['task-1']!.activeLease).toBeDefined()

    service.releaseSubmit(run.id, 'task-1')
    service.sweepExpiredState(run.id)

    const task = service.getRun(run.id).tasks['task-1']!
    expect(task.activeLease).toBeUndefined()
    // The task returned to the pool (owner cleared), so the stale report is
    // rejected before any lease comparison.
    expect(() => service.submitExecution(dps1, run.id, completedReport(lease))).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
  })

  it('refuses to re-protect a lease that expired beyond the grace window', () => {
    const { service, run, lease, advance } = setupWithMutableClock()

    // Expired 200s ago: far beyond the 60s grace. Protecting now must not
    // mint a fresh window — the stale lease stays sweepable and un-submittable.
    advance(800_000)
    service.protectSubmit(run.id, 'task-1')
    service.sweepExpiredState(run.id)

    expect(service.getRun(run.id).tasks['task-1']!.activeLease).toBeUndefined()
    expect(() => service.submitExecution(dps1, run.id, completedReport(lease))).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
  })
})

function passSubmission(manifest: ValidationManifest, validationId: string): ValidationSubmission {
  return {
    validationId,
    verdict: 'pass',
    taskSetVersion: manifest.taskSetVersion,
    manifestVersion: manifest.manifestVersion,
    workspaceFingerprint: manifest.workspaceFingerprint,
    checks: [
      {
        criterionId: 'task-1:works',
        status: 'pass',
        evidence: ['unit tests passed'],
      },
    ],
    findings: [],
    summary: 'All required checks passed',
  }
}

describe('DungeonService', () => {
  it('creates five stable slots and persists reconstructable events', () => {
    const { service, persisted } = setup()

    const run = service.startRun({
      runId: 'run-1',
      objective: 'Build a reliable core',
      workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1',
      tankSessionId: tank.sessionId,
    })

    expect(run.phase).toBe('FORMING')
    expect(run.controlState).toBe('normal')
    // Until per-agent write telemetry exists, auto resolves to the only
    // honestly isolated mode: serialized write leases.
    expect(run.scopeEnforcementMode).toBe('serial')
    expect(Object.keys(run.slots)).toEqual(['tank', 'dps-1', 'dps-2', 'dps-3', 'healer'])
    expect(run.slots.tank).toMatchObject({ currentSessionId: tank.sessionId, generation: 1 })
    expect(run.slots['dps-1']).toMatchObject({ generation: 0, history: [] })
    expect(persisted.map((event) => event.type)).toEqual([
      'dungeon/run-created',
      'dungeon/member-bound',
    ])
    expect(persisted.map((event) => event.sequence)).toEqual([1, 2])
    expect(service.startRun({
      runId: 'run-1', objective: 'Build a reliable core', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })).toEqual(run)
    expect(persisted).toHaveLength(2)
    expect(() => service.startRun({
      runId: 'run-1', objective: 'Different', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }))

    const recovered = service.recoverRun(run.id)
    expect(recovered).toEqual(run)
  })

  it('formats readable run ids deterministically (UTC) from an instant and suffix', () => {
    expect(createReadableRunId(new Date(Date.UTC(2025, 0, 2, 3, 4, 5, 678)), 'ab12cd34'))
      .toBe('run-20250102-030405-ab12cd34')
  })

  it('generates readable unique host run ids when the caller omits runId', () => {
    const { service } = setup()

    const run = service.startRun({
      objective: 'Build', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })
    const second = service.startRun({
      objective: 'Build again', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })

    expect(run.id).toMatch(/^run-\d{8}-\d{6}-[0-9a-z]{8}$/)
    expect(second.id).toMatch(/^run-\d{8}-\d{6}-[0-9a-z]{8}$/)
    expect(second.id).not.toBe(run.id)
  })

  it('retries auto-generated run ids that collide with existing runs', () => {
    let index = 0
    const generated = ['dup', 'dup', 'fresh']
    const persisted: DungeonEvent[] = []
    const service = new DungeonService({
      eventStore: {
        append(event) { persisted.push(structuredClone(event)) },
        load(runId) { return persisted.filter((event) => event.runId === runId).map((event) => structuredClone(event)) },
      },
      idGenerator: (() => { let id = 0; return () => `id-${++id}` })(),
      clock: () => '2025-01-01T00:00:00.000Z',
      runIdGenerator: () => generated[index++] ?? 'extra',
    })
    service.startRun({
      runId: 'dup', objective: 'Existing', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })

    const run = service.startRun({
      objective: 'Build', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })

    expect(run.id).toBe('fresh')
  })

  it('waits from an event cursor and returns only newer durable events', async () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: process.cwd(),
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
      workspaceRoot: process.cwd(),
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
      workspaceRoot: process.cwd(),
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
          writeScopes: ['src/service/parser/**'],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'WRITE_SCOPE_CONFLICT' }))
  })

  it('allows each workspace-global command to belong to only one work order', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: process.cwd(),
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
      runId: 'run-1', objective: 'Build', workspaceRoot: process.cwd(),
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
      writeScopes: ['src/service/parser/**'],
    }))).not.toThrow()
  })

  it('serializes write-task assignment when strict scope enforcement has no telemetry', () => {
    const { service } = setup({ strictPerAgentWriteScopes: true })
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: process.cwd(),
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
    service.claimTask(dps1, run.id, 'task-1')

    // The tank's manual assignment path hits the same serial gate as the
    // scheduler: a second write task cannot enter the claimable state.
    expect(() => service.assignTask(tank, run.id, 'task-2', 'dps-2')).toThrowError(
      expect.objectContaining({ code: 'WRITE_DISPATCH_SERIALIZED' }),
    )
  })

  it('tells serialized assignment to wait instead of creating claim contention', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: process.cwd(),
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
    service.claimTask(dps1, run.id, 'task-1')

    expect(() => service.assignTask(tank, run.id, 'task-2', 'dps-2')).toThrowError(
      expect.objectContaining({
        code: 'WRITE_DISPATCH_SERIALIZED',
        message: expect.stringContaining('party_wait'),
      }),
    )
  })

  it('keeps a downed write task ahead of the serial queue until it is reassigned', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, run.id, 'healer', healer.sessionId)
    service.bindMember(tank, run.id, 'dps-1', dps1.sessionId)
    service.bindMember(tank, run.id, 'dps-2', 'session-dps-2')
    service.bindMember(tank, run.id, 'dps-3', 'session-dps-3')
    service.changePhase(tank, run.id, 'PLANNING')
    service.createTask(tank, run.id, task())
    service.createTask(tank, run.id, task({
      id: 'task-2', writeScopes: ['tests/**'],
      acceptanceCriteria: [{ id: 'task-2:works', description: 'Second works', required: true }],
    }))
    service.changePhase(tank, run.id, 'EXECUTING')
    service.assignTask(tank, run.id, 'task-2', 'dps-2')
    service.claimTask({ sessionId: 'session-dps-2' }, run.id, 'task-2')
    service.markMemberDown(run.id, 'dps-2', 'runtime crashed')

    // task-2 lost its lease to the crash but stays owned and ready, so the
    // serial queue must not admit another write task behind its back.
    expect(() => service.assignTask(tank, run.id, 'task-1', 'dps-1')).toThrowError(
      expect.objectContaining({ code: 'WRITE_DISPATCH_SERIALIZED' }),
    )

    // Reassignment to a live slot clears the queue head.
    const reassigned = service.reassignTask(tank, run.id, 'task-2', 'dps-3')
    expect(reassigned).toMatchObject({ ownerSlot: 'dps-3', status: 'ready' })
    const lease = service.claimTask({ sessionId: 'session-dps-3' }, run.id, 'task-2')
    service.submitExecution({ sessionId: 'session-dps-3' }, run.id, {
      taskId: 'task-2', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-3', generation: 1, status: 'completed', summary: 'Done',
      changedFiles: ['tests/dungeon-service.test.ts'], evidence: ['done'], commandsRun: [], risks: [], remainingWork: [],
      modifiedAssertions: [{ file: 'tests/dungeon-service.test.ts', test: 'task-2 works', reason: 'added coverage for the new behavior' }],
    })

    // With the queue drained, task-1 is assignable again.
    expect(service.assignTask(tank, run.id, 'task-1', 'dps-1')).toMatchObject({ ownerSlot: 'dps-1', status: 'ready' })
  })

  it('enforces maxConcurrentDps when granting leases', () => {
    const { service } = setup({ maxConcurrentDps: 1 })
    const run = service.startRun({
      runId: 'run-1', objective: 'Build', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, run.id, 'healer', healer.sessionId)
    service.bindMember(tank, run.id, 'dps-1', dps1.sessionId)
    service.bindMember(tank, run.id, 'dps-2', 'session-dps-2')
    service.changePhase(tank, run.id, 'PLANNING')
    service.createTask(tank, run.id, { ...task(), writeScopes: [] })
    service.createTask(tank, run.id, task({
      id: 'task-2', writeScopes: [],
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
      workspaceRoot: process.cwd(),
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
        changedFiles: ['src/service/dungeon-service.ts'],
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
        changedFiles: ['src/service/dungeon-service.ts'],
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
      changedFiles: ['src/service/dungeon-service.ts'], evidence: ['unit tests passed'], commandsRun: [], risks: [], remainingWork: [],
    }
    service.submitExecution(dps1, run.id, report)
    service.submitExecution(dps1, run.id, report)
    expect(service.getRun(run.id).tasks['task-1']?.executionReports).toHaveLength(1)
    expect(() => service.submitExecution(dps1, run.id, { ...report, summary: 'Conflicting retry' })).toThrowError(
      expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
    )
  })

  it('rejects incomplete pass reports and completes only the validated workspace version', async () => {
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
      changedFiles: ['src/service/dungeon-service.ts'],
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

    await expect(service.finishRun(tank, run.id, 'Summary', 'fingerprint-v2')).rejects.toThrowError(
      expect.objectContaining({ code: 'STALE_VALIDATION' }),
    )
    for (const kind of ['tool-failure', 'queue-pressure'] as const) {
      service.observeHealthSignal(run.id, {
        slot: 'healer', source: 'runtime', kind, severity: 'warning',
        windowMs: 120_000, evidence: [kind],
      })
    }
    await expect(service.finishRun(tank, run.id, 'Summary', 'fingerprint-v1')).rejects.toThrowError(
      expect.objectContaining({ code: 'MEMBER_NOT_READY' }),
    )
    const maintenance = service.directValidatorMaintenance(tank, run.id)
    service.completeValidatorMaintenance(healer, run.id, maintenance.instructionId, true)
    await expect(service.finishRun(tank, run.id, 'Implemented and tested', 'fingerprint-v1')).resolves.toMatchObject({
      phase: 'COMPLETED',
    })
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

  it('completes a run in two phases when the recomputed workspace fingerprint matches', async () => {
    const { service, persisted } = setup()
    const manifest = validatingRun(service)
    service.submitValidation(healer, 'run-1', passSubmission(manifest, 'validation-1'))

    let recomputations = 0
    const completed = await service.finishRun(tank, 'run-1', 'Implemented and tested', 'fingerprint-v1', () => {
      recomputations += 1
      return 'fingerprint-v1'
    })

    expect(recomputations).toBe(1)
    expect(completed.phase).toBe('COMPLETED')
    expect(persisted.map((event) => event.type).slice(-2)).toEqual([
      'dungeon/run-completion-prepared',
      'dungeon/run-completed',
    ])
    expect(persisted.some((event) => event.type === 'dungeon/run-completion-aborted')).toBe(false)
  })

  it('aborts completion, stales reports, and stays validating when the workspace changed', async () => {
    const { service, persisted } = setup()
    const manifest = validatingRun(service)
    service.submitValidation(healer, 'run-1', passSubmission(manifest, 'validation-1'))

    let error: DungeonError | undefined
    try {
      await service.finishRun(tank, 'run-1', 'Implemented and tested', 'fingerprint-v1', () => 'fingerprint-v2')
    } catch (caught) {
      error = caught as DungeonError
    }

    expect(error).toMatchObject({ name: 'DungeonError', code: 'WORKSPACE_CHANGED_DURING_COMPLETION' })
    expect(error?.message).toContain('fingerprint-v1')
    expect(error?.message).toContain('fingerprint-v2')

    const abortedEvent = persisted.find((event) => event.type === 'dungeon/run-completion-aborted')
    expect(abortedEvent?.payload).toMatchObject({
      expectedFingerprint: 'fingerprint-v1',
      actualFingerprint: 'fingerprint-v2',
      taskSetVersion: manifest.taskSetVersion,
      manifestVersion: manifest.manifestVersion,
    })
    expect(persisted.map((event) => event.type).slice(-2)).toEqual([
      'dungeon/run-completion-prepared',
      'dungeon/run-completion-aborted',
    ])
    expect(persisted.some((event) => event.type === 'dungeon/run-completed')).toBe(false)

    const after = service.getRun('run-1')
    expect(after.phase).toBe('VALIDATING')
    expect(after.validationReports.at(-1)?.status).toBe('stale')

    // The stale report can no longer complete the run even against a stable workspace.
    await expect(
      service.finishRun(tank, 'run-1', 'Implemented and tested', 'fingerprint-v1', () => 'fingerprint-v1'),
    ).rejects.toThrowError(expect.objectContaining({ code: 'VALIDATION_REQUIRED' }))

    // A fresh manifest and pass report for the changed workspace complete the run.
    const nextManifest = service.createValidationManifest(tank, 'run-1', 'fingerprint-v2')
    expect(nextManifest).toMatchObject({ manifestVersion: 2, workspaceFingerprint: 'fingerprint-v2' })
    service.submitValidation(healer, 'run-1', passSubmission(nextManifest, 'validation-2'))
    const completed = await service.finishRun(tank, 'run-1', 'Implemented and tested', 'fingerprint-v2', () => 'fingerprint-v2')
    expect(completed.phase).toBe('COMPLETED')
  })

  it('keeps earlier reports current when new reports are submitted against the same manifest', () => {
    const { service } = setup()
    const manifest = validatingRun(service)
    service.submitValidation(healer, 'run-1', passSubmission(manifest, 'validation-1'))

    service.submitValidation(healer, 'run-1', {
      validationId: 'validation-2',
      verdict: 'fail',
      taskSetVersion: manifest.taskSetVersion,
      manifestVersion: manifest.manifestVersion,
      workspaceFingerprint: manifest.workspaceFingerprint,
      checks: [
        { criterionId: 'task-1:works', status: 'fail', evidence: ['regression found'] },
      ],
      findings: [
        {
          id: 'finding-1',
          severity: 'major',
          ownerTaskId: 'task-1',
          title: 'Regression',
          evidence: 'reproduction',
          remediation: 'fix it',
        },
      ],
      summary: 'A later re-check found a defect',
    })

    let run = service.getRun('run-1')
    expect(run.validationReports.map((report) => [report.validationId, report.status])).toEqual([
      ['validation-1', 'current'],
      ['validation-2', 'current'],
    ])

    // Fingerprint and manifest changes still invalidate prior reports.
    service.observeWorkspaceFingerprint('run-1', 'fingerprint-v2')
    run = service.getRun('run-1')
    expect(run.validationReports.every((report) => report.status === 'stale')).toBe(true)

    const nextManifest = service.createValidationManifest(tank, 'run-1', 'fingerprint-v2')
    service.submitValidation(healer, 'run-1', passSubmission(nextManifest, 'validation-3'))
    run = service.getRun('run-1')
    expect(run.validationReports.map((report) => [report.validationId, report.status])).toEqual([
      ['validation-1', 'stale'],
      ['validation-2', 'stale'],
      ['validation-3', 'current'],
    ])
  })
})

describe('post-append state returns (reducer purity regression)', () => {
  it('createTask returns the created task record', () => {
    const { service } = setup()
    service.startRun({
      runId: 'run-1', objective: 'o', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'v1', tankSessionId: tank.sessionId,
    })
    service.changePhase(tank, 'run-1', 'PLANNING')
    const created = service.createTask(tank, 'run-1', task())
    expect(created).toMatchObject({ status: 'pending', repairRound: 0 })
    expect(created?.workOrder.id).toBe('task-1')
  })

  it('changePhase returns the run in its new phase', () => {
    const { service } = setup()
    service.startRun({
      runId: 'run-1', objective: 'o', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'v1', tankSessionId: tank.sessionId,
    })
    const updated = service.changePhase(tank, 'run-1', 'PLANNING')
    expect(updated.phase).toBe('PLANNING')
  })

  it('bindMember returns the run with the newly bound slot', () => {
    const { service } = setup()
    service.startRun({
      runId: 'run-1', objective: 'o', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'v1', tankSessionId: tank.sessionId,
    })
    const bound = service.bindMember(tank, 'run-1', 'healer', healer.sessionId)
    expect(bound.slots.healer.currentSessionId).toBe(healer.sessionId)
    expect(bound.slots.healer.generation).toBe(1)
  })

  it('registerTaskTurn and submitCheckpoint return post-event task state', () => {
    const { service } = setup()
    createReadyRun(service)
    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    const lease = service.claimTask(dps1, 'run-1', 'task-1')
    const withTurn = service.registerTaskTurn('run-1', 'task-1', 'turn-7')
    expect(withTurn.currentTurnId).toBe('turn-7')
    const submitted = service.submitCheckpoint(dps1, 'run-1', {
      checkpointId: 'cp-1', taskId: 'task-1', taskVersion: 1,
      leaseId: lease.leaseId, leaseVersion: 1, slot: 'dps-1',
      completed: ['step'], nextSteps: ['next'], evidenceDelta: ['evidence'], blockers: [],
      workspaceFingerprint: 'fingerprint-v1',
    })
    expect(submitted.activeLease?.version).toBe(2)
    expect(submitted.lastCheckpoint?.checkpointId).toBe('cp-1')
  })
})

describe('DungeonError', () => {
  it('exposes a machine-readable code', () => {
    const error = new DungeonError('EXAMPLE', 'example')
    expect(error).toMatchObject({ name: 'DungeonError', code: 'EXAMPLE', message: 'example' })
  })
})

describe('dispatch invariants', () => {
  it('refuses to assign a second task to a slot that already owns a ready task', () => {
    const { service } = setup()
    const run = service.startRun({
      runId: 'run-1', objective: 'Build a reliable core', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'fingerprint-v1', tankSessionId: tank.sessionId,
    })
    service.bindMember(tank, run.id, 'healer', healer.sessionId)
    service.bindMember(tank, run.id, 'dps-1', dps1.sessionId)
    service.changePhase(tank, run.id, 'PLANNING')
    service.createTask(tank, run.id, task())
    service.createTask(tank, run.id, task({
      id: 'task-2',
      acceptanceCriteria: [{ id: 'task-2:works', description: 'Second task works', required: true }],
      writeScopes: ['docs/**'],
    }))
    service.changePhase(tank, run.id, 'EXECUTING')
    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')

    expect(() => service.assignTask(tank, 'run-1', 'task-2', 'dps-1'))
      .toThrowError(expect.objectContaining({ code: 'SLOT_BUSY' }))
  })

  it('refuses a claim from a down member even when the session reappears', () => {
    const { service } = setup()
    createReadyRun(service)
    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    service.markMemberDown('run-1', 'dps-1', 'runtime crashed')

    expect(() => service.claimTask(dps1, 'run-1', 'task-1'))
      .toThrowError(expect.objectContaining({ code: 'MEMBER_NOT_ALIVE' }))
  })

  it('freezes write leases while the healer is unavailable via health signals', () => {
    const { service } = setup()
    createReadyRun(service)
    for (const kind of ['tool-failure', 'timeout'] as const) {
      service.observeHealthSignal('run-1', {
        slot: 'healer', source: 'runtime', kind, severity: 'critical',
        windowMs: 120_000, evidence: [kind],
      })
    }

    const run = service.getRun('run-1')
    expect(run.slots.healer.readiness).toBe('unavailable')
    expect(run.controlState).toBe('paused')

    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    expect(() => service.claimTask(dps1, 'run-1', 'task-1'))
      .toThrowError(expect.objectContaining({ code: 'DISPATCH_BLOCKED' }))
    expect(() => service.resumeDispatch(tank, 'run-1'))
      .toThrowError(expect.objectContaining({ code: 'HEALER_NOT_RECOVERED' }))
  })

  it('fails the run instead of throwing when the commander dies before the healer is bound', () => {
    const { service } = setup()
    service.startRun({
      runId: 'run-1', objective: 'o', workspaceRoot: process.cwd(),
      workspaceFingerprint: 'v1', tankSessionId: tank.sessionId,
    })

    expect(() => service.observeAgentDisposed(tank.sessionId, 'runtime Agent disposed')).not.toThrow()
    expect(service.getRun('run-1').phase).toBe('FAILED')
  })
})

describe('execution failure recovery', () => {
  function blockedSubmission(lease: { leaseId: string; version: number }, taskVersion: number) {
    return {
      taskId: 'task-1', taskVersion, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1' as const, generation: 1, status: 'blocked' as const,
      summary: 'Blocked by an external dependency', changedFiles: [] as string[],
      evidence: ['dependency unavailable'], commandsRun: [] as Array<{ command: string; summary: string }>,
      risks: [] as string[], remainingWork: ['wait for dependency'],
    }
  }

  it('lets a blocked required task be retried back into the schedulable pool', () => {
    const { service } = setup()
    createReadyRun(service)
    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    let lease = service.claimTask(dps1, 'run-1', 'task-1')
    service.submitExecution(dps1, 'run-1', blockedSubmission(lease, 1))

    // The former dead end: VALIDATING is unreachable while the required task
    // is blocked, and reopenTask needs a failed validation report that can
    // never be produced. retryExecution breaks the cycle.
    expect(() => service.changePhase(tank, 'run-1', 'VALIDATING'))
      .toThrowError(expect.objectContaining({ code: 'INCOMPLETE_TASKS' }))

    const retried = service.retryExecution(tank, 'run-1', 'task-1', 'external dependency is unblocked')
    expect(retried).toMatchObject({ status: 'pending', executionRetries: 1 })
    expect(retried.workOrder.version).toBe(2)
    expect(retried.ownerSlot).toBeUndefined()

    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    lease = service.claimTask(dps1, 'run-1', 'task-1')
    service.submitExecution(dps1, 'run-1', {
      taskId: 'task-1', taskVersion: 2, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1', generation: 1, status: 'completed', summary: 'Done',
      changedFiles: ['src/service/dungeon-service.ts'], evidence: ['tests green'],
      commandsRun: [], risks: [], remainingWork: [],
    })
    expect(() => service.changePhase(tank, 'run-1', 'VALIDATING')).not.toThrow()
  })

  it('enforces the execution retry budget', () => {
    const { service } = setup({ maxExecutionRetries: 1 })
    createReadyRun(service)
    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    let lease = service.claimTask(dps1, 'run-1', 'task-1')
    service.submitExecution(dps1, 'run-1', blockedSubmission(lease, 1))
    service.retryExecution(tank, 'run-1', 'task-1', 'first retry')
    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    lease = service.claimTask(dps1, 'run-1', 'task-1')
    service.submitExecution(dps1, 'run-1', blockedSubmission(lease, 2))

    expect(() => service.retryExecution(tank, 'run-1', 'task-1', 'second retry'))
      .toThrowError(expect.objectContaining({ code: 'RETRY_LIMIT_EXCEEDED' }))
    expect(() => service.retryExecution(tank, 'run-1', 'task-1', ''))
      .toThrowError(expect.objectContaining({ code: 'RETRY_REASON_REQUIRED' }))
  })

  it('allows reassignment away from a down owner without the interrupt flow', () => {
    const { service } = setup()
    createReadyRun(service)
    service.bindMember(tank, 'run-1', 'dps-2', 'session-dps-2')
    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    service.claimTask(dps1, 'run-1', 'task-1')

    // Alive owner without a confirmed interrupt keeps the old gate.
    expect(() => service.reassignTask(tank, 'run-1', 'task-1', 'dps-2'))
      .toThrowError(expect.objectContaining({ code: 'INTERRUPT_NOT_CONFIRMED' }))

    service.markMemberDown('run-1', 'dps-1', 'runtime crashed')
    const reassigned = service.reassignTask(tank, 'run-1', 'task-1', 'dps-2')
    expect(reassigned).toMatchObject({ status: 'ready' })
    expect(reassigned.ownerSlot).toBe('dps-2')
  })
})

describe('completion gate hardening', () => {
  it('keeps a terminal CANCELLED run from being overwritten by a racing finish', async () => {
    const { service, persisted } = setup()
    validatingRun(service)
    service.submitValidation(healer, 'run-1', passSubmission(
      service.createValidationManifest(tank, 'run-1', 'fingerprint-v1'), 'validation-race',
    ))

    const finish = service.finishRun(tank, 'run-1', 'Shipped', 'fingerprint-v1', async () => {
      // The tank cancels while the fingerprint recompute is in flight.
      service.changePhase(tank, 'run-1', 'CANCELLED')
      return 'fingerprint-v1'
    })

    await expect(finish).rejects.toThrowError(expect.objectContaining({ code: 'COMPLETION_CONFLICT' }))
    expect(service.getRun('run-1').phase).toBe('CANCELLED')
    expect(persisted.map((event) => event.type)).not.toContain('dungeon/run-completed')
    expect(persisted.map((event) => event.type)).toContain('dungeon/run-completion-prepared')
  })

  it('completes without a validation report only when validationRequired is false', async () => {
    const { service } = setup({ validationRequired: false })
    createReadyRun(service)
    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    const lease = service.claimTask(dps1, 'run-1', 'task-1')
    service.submitExecution(dps1, 'run-1', {
      taskId: 'task-1', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1', generation: 1, status: 'completed', summary: 'Done',
      changedFiles: ['src/service/dungeon-service.ts'], evidence: ['tests green'],
      commandsRun: [], risks: [], remainingWork: [],
    })
    service.changePhase(tank, 'run-1', 'VALIDATING')

    const finished = await service.finishRun(tank, 'run-1', 'Shipped', 'fingerprint-v1')
    expect(finished.phase).toBe('COMPLETED')
  })

  it('still requires a current pass report when validationRequired is true', async () => {
    const { service } = setup()
    createReadyRun(service)
    service.assignTask(tank, 'run-1', 'task-1', 'dps-1')
    const lease = service.claimTask(dps1, 'run-1', 'task-1')
    service.submitExecution(dps1, 'run-1', {
      taskId: 'task-1', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1', generation: 1, status: 'completed', summary: 'Done',
      changedFiles: ['src/service/dungeon-service.ts'], evidence: ['tests green'],
      commandsRun: [], risks: [], remainingWork: [],
    })
    service.changePhase(tank, 'run-1', 'VALIDATING')

    await expect(service.finishRun(tank, 'run-1', 'Shipped', 'fingerprint-v1'))
      .rejects.toThrowError(expect.objectContaining({ code: 'VALIDATION_REQUIRED' }))
  })
})
