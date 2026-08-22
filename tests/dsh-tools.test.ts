import { describe, expect, it, vi } from 'vitest'

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'

import { DungeonService, type DungeonEvent } from '../src/service/dungeon-service.js'
import { registerDungeonTools, boundedText } from '../src/tools/register.js'
import { addDungeonTypes, DUNGEON_SESSION_EVENT_TYPES } from '../src/session-event-compat.js'

// The two-phase party_finish test needs the workspace fingerprint to change
// exactly between finishRun's first computation and its recompute callback.
// Mocking the adapter (delegating to the real implementation by default)
// gives each test deterministic control without touching the shared workspace.
const { fingerprintMock } = vi.hoisted(() => ({ fingerprintMock: vi.fn() }))

vi.mock('../src/adapters/workspace-fingerprint.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/adapters/workspace-fingerprint.js')>()
  fingerprintMock.mockImplementation(actual.computeWorkspaceFingerprint)
  return { ...actual, computeWorkspaceFingerprint: fingerprintMock }
})

function setup(agentManager?: Parameters<typeof registerDungeonTools>[2]) {
  const events: DungeonEvent[] = []
  const service = new DungeonService({
    eventStore: {
      append: (event) => events.push(structuredClone(event)),
      load: (runId) => events.filter((event) => event.runId === runId).map((event) => structuredClone(event)),
    },
    idGenerator: (() => {
      let id = 0
      return () => `id-${++id}`
    })(),
    clock: () => '2025-01-01T00:00:00.000Z',
  })
  const definitions: ToolDefinition[] = []
  const context = {
    tools: {
      register(definition: ToolDefinition) {
        definitions.push(definition)
        return () => undefined
      },
    },
  } as unknown as Context
  const dispose = registerDungeonTools(context, service, agentManager)
  return { service, definitions, dispose }
}

function execution(sessionId?: string): ToolRunContext {
  return {
    callId: 'call-1' as never,
    name: 'test',
    arguments: {},
    signal: new AbortController().signal,
    token: Symbol('token') as never,
    deferContext() {},
    concludeTurn() {},
    ...(sessionId ? { agent: { id: sessionId } as never } : {}),
  } as unknown as ToolRunContext
}

describe('DSH dungeon tools', () => {
  it('registers the initial role-separated model tool surface', () => {
    const { definitions, dispose } = setup()

    expect(definitions.map((definition) => definition.name)).toEqual([
      'party_start',
      'party_status',
      'party_wait',
      'party_phase',
      'party_health',
      'party_assign',
      'party_reopen',
      'party_direct_recovery',
      'party_request_checkpoint',
      'party_interrupt',
      'party_review_quarantine',
      'party_reassign',
      'party_recover',
      'party_resume_dispatch',
      'request_battle_res',
      'work_claim',
      'work_submit',
      'verification_run',
      'member_checkpoint',
      'party_message',
      'member_self_maintain',
      'validation_manifest',
      'validation_submit',
      'battle_res',
      'party_finish',
      'party_cancel',
    ])

    expect(() => dispose()).not.toThrow()
  })

  it('derives the tank identity from the executing DSH agent', async () => {
    const { definitions } = setup()
    const start = definitions.find((definition) => definition.name === 'party_start')!

    const result = await start.execute(
      {
        runId: 'run',
        objective: 'Build it',
        workspaceRoot: process.cwd(),
      },
      execution('tank-session'),
    ) as { slots: { tank: { currentSessionId: string } } }

    expect(result.slots.tank.currentSessionId).toBe('tank-session')
    expect((result as unknown as { workspaceFingerprint: string }).workspaceFingerprint).toMatch(/^sha256:/)
  })

  it('generates task identity and treats the outer runId as authoritative', async () => {
    const { definitions, service } = setup()
    const start = definitions.find((definition) => definition.name === 'party_start')!
    const phase = definitions.find((definition) => definition.name === 'party_phase')!
    const assign = definitions.find((definition) => definition.name === 'party_assign')!
    await start.execute({ runId: 'run', objective: 'Build', workspaceRoot: process.cwd() }, execution('tank'))
    await phase.execute({ runId: 'run', phase: 'PLANNING' }, execution('tank'))

    await expect(assign.execute({
      runId: 'run',
      action: 'create',
      workOrder: {
        runId: 'stale-model-value', title: 'Task', objective: 'Implement',
        acceptanceCriteria: [{ description: 'Done' }],
        readScopes: ['src/**'], writeScopes: ['src/**'],
      },
    }, execution('tank'))).resolves.toMatchObject({ workOrder: {
      runId: 'run', version: 1, blockedBy: [],
      acceptanceCriteria: [{ id: 'task-1:criterion-1', description: 'Done', required: true }],
    } })
    expect(service.getRun('run').tasks['task-1']?.workOrder.runId).toBe('run')
  })

  it('rejects premature assignment before creating a child Agent', async () => {
    const ensureMember = vi.fn()
    const { definitions } = setup({ ensureMember, prepareForPhase: vi.fn() } as never)
    const start = definitions.find((definition) => definition.name === 'party_start')!
    const phase = definitions.find((definition) => definition.name === 'party_phase')!
    const assign = definitions.find((definition) => definition.name === 'party_assign')!
    await start.execute({ runId: 'run', objective: 'Build', workspaceRoot: process.cwd() }, execution('tank'))
    await phase.execute({ runId: 'run', phase: 'PLANNING' }, execution('tank'))
    await assign.execute({
      runId: 'run', action: 'create', workOrder: {
        id: 'task-1', title: 'Task', objective: 'Implement',
        acceptanceCriteria: ['Done'], writeScopes: ['src/**'],
      },
    }, execution('tank'))

    await expect(assign.execute({
      runId: 'run', action: 'assign', taskId: 'task-1', slot: 'dps-1',
    }, execution('tank'))).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
      recommendedAction: { tool: 'party_phase', phase: 'EXECUTING' },
    })
    expect(ensureMember).not.toHaveBeenCalled()
  })

  it('returns recovery guidance instead of throwing when an alive DPS is targeted', async () => {
    const { definitions, service } = setup()
    const start = definitions.find((definition) => definition.name === 'party_start')!
    const battleRes = definitions.find((definition) => definition.name === 'request_battle_res')!
    await start.execute({ runId: 'run', objective: 'Build', workspaceRoot: process.cwd() }, execution('tank'))
    service.bindMember({ sessionId: 'tank' }, 'run', 'dps-1', 'dps-live')

    await expect(battleRes.execute({ runId: 'run', slot: 'dps-1' }, execution('tank'))).resolves.toMatchObject({
      ok: false,
      code: 'MEMBER_NOT_DOWN',
      currentLifeState: 'alive',
      recommendedTools: ['party_request_checkpoint', 'party_interrupt'],
    })
  })

  it('normalizes party messages when the model omits summary', async () => {
    const { definitions } = setup()
    const start = definitions.find((definition) => definition.name === 'party_start')!
    const message = definitions.find((definition) => definition.name === 'party_message')!
    await start.execute({ runId: 'run', objective: 'Build', workspaceRoot: process.cwd() }, execution('tank'))

    await expect(message.execute({
      runId: 'run', toSlot: 'tank', message: { kind: 'notice', evidence: ['Build completed'] },
    }, execution('tank'))).resolves.toMatchObject({
      kind: 'notice', summary: 'Build completed', evidence: ['Build completed'],
    })
  })

  it('derives technical lease fields for minimal DPS execution reports', async () => {
    const { definitions, service } = setup()
    const start = definitions.find((definition) => definition.name === 'party_start')!
    const submit = definitions.find((definition) => definition.name === 'work_submit')!
    await start.execute({ runId: 'run', objective: 'Build', workspaceRoot: process.cwd() }, execution('tank'))
    service.bindMember({ sessionId: 'tank' }, 'run', 'healer', 'healer')
    service.bindMember({ sessionId: 'tank' }, 'run', 'dps-1', 'dps')
    service.changePhase({ sessionId: 'tank' }, 'run', 'PLANNING')
    service.createTask({ sessionId: 'tank' }, 'run', {
      id: 'task-1', runId: 'run', version: 1, title: 'Task', objective: 'Implement', inputs: [], constraints: [],
      acceptanceCriteria: [{ id: 'criterion-1', description: 'Done', required: true }], readScopes: [], writeScopes: [],
      globalCommands: [], blockedBy: [], expectedArtifacts: [], priority: 'normal', required: true,
    })
    service.changePhase({ sessionId: 'tank' }, 'run', 'EXECUTING')
    service.assignTask({ sessionId: 'tank' }, 'run', 'task-1', 'dps-1')
    service.claimTask({ sessionId: 'dps' }, 'run', 'task-1')

    await expect(submit.execute({
      runId: 'run', report: { taskId: 'task-1', evidence: ['Tests passed'] },
    }, execution('dps'))).resolves.toMatchObject({ status: 'completed' })
    expect(service.getRun('run').tasks['task-1']?.executionReports[0]).toMatchObject({
      slot: 'dps-1', generation: 1, taskVersion: 1, status: 'completed', evidence: ['Tests passed'],
    })
  })

  it('keeps status and wait results bounded as durable history grows', async () => {
    const { definitions, service } = setup()
    const start = definitions.find((definition) => definition.name === 'party_start')!
    const status = definitions.find((definition) => definition.name === 'party_status')!
    const wait = definitions.find((definition) => definition.name === 'party_wait')!
    await start.execute({ runId: 'run', objective: 'Build', workspaceRoot: process.cwd() }, execution('tank'))
    for (let index = 0; index < 80; index += 1) {
      service.sendPartyMessage({ sessionId: 'tank' }, 'run', 'tank', {
        kind: 'notice', summary: `message-${index}-${'x'.repeat(500)}`, evidence: ['y'.repeat(500)],
      })
    }

    const statusResult = await status.execute({ runId: 'run' }, execution('tank'))
    const waitResult = await wait.execute({ runId: 'run', afterSequence: 0, timeoutMs: 1 }, execution('tank')) as unknown as {
      events: unknown[]; omittedEventCount: number
    }

    expect(JSON.stringify(statusResult).length).toBeLessThan(12_000)
    expect(JSON.stringify(waitResult).length).toBeLessThan(16_000)
    expect(waitResult.events).toHaveLength(24)
    expect(waitResult.omittedEventCount).toBeGreaterThan(0)
  })

  it('restarts a wiped dungeon with a host-generated fresh run', async () => {
    const { definitions, service } = setup()
    const start = definitions.find((definition) => definition.name === 'party_start')!
    const recover = definitions.find((definition) => definition.name === 'party_recover')!
    await start.execute({ runId: 'run', objective: 'Build', workspaceRoot: process.cwd() }, execution('tank'))

    const restarted = await recover.execute({ runId: 'run', action: 'restart' }, execution('tank')) as unknown as { id: string; phase: string }

    expect(restarted.id).not.toBe('run')
    expect(restarted.phase).toBe('FORMING')
    expect(service.getRun('run').phase).toBe('CANCELLED')
  })

  it('rejects tool calls without an authenticated agent identity', async () => {
    const { definitions } = setup()
    const start = definitions.find((definition) => definition.name === 'party_start')!

    await expect(
      start.execute(
        {
          runId: 'run',
          objective: 'Build it',
          workspaceRoot: '/workspace',
          workspaceFingerprint: 'v1',
        },
        execution(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('derives checkpoint lease identity so the DPS only supplies semantics', async () => {
    const { service, definitions } = setup()
    const checkpointTool = definitions.find((definition) => definition.name === 'member_checkpoint')!
    const tank = { sessionId: 'tank' }
    service.startRun({ runId: 'run', objective: 'o', workspaceRoot: '/workspace', workspaceFingerprint: 'v1', tankSessionId: 'tank' })
    service.bindMember(tank, 'run', 'healer', 'session-healer')
    service.bindMember(tank, 'run', 'dps-1', 'session-dps')
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', {
      id: 'task', runId: 'run', title: 'T', objective: 'T', inputs: [], constraints: [],
      acceptanceCriteria: [{ id: 'task:done', description: 'Done', required: true }],
      readScopes: ['src/**'], writeScopes: ['src/**'], blockedBy: [], expectedArtifacts: [],
      priority: 'normal', required: true, version: 1,
    })
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    const lease = service.claimTask({ sessionId: 'session-dps' }, 'run', 'task')

    const submitted = await checkpointTool.execute(
      { runId: 'run', taskId: 'task', completed: ['step'], evidenceDelta: ['evidence'] },
      execution('session-dps'),
    ) as unknown as { activeLease?: { version: number }, lastCheckpoint?: { evidenceDelta: string[] } }

    expect(submitted.activeLease?.version).toBe(2)
    expect(submitted.lastCheckpoint?.evidenceDelta).toEqual(['evidence'])
    expect(service.getRun('run').tasks.task!.activeLease?.leaseId).toBe(lease.leaseId)
  })

  it('derives manifest identity so the healer only supplies semantics', async () => {
    const { service, definitions } = setup()
    const submitTool = definitions.find((definition) => definition.name === 'validation_submit')!
    const tank = { sessionId: 'tank' }
    service.startRun({ runId: 'run', objective: 'o', workspaceRoot: process.cwd(), workspaceFingerprint: 'v1', tankSessionId: 'tank' })
    service.bindMember(tank, 'run', 'healer', 'session-healer')
    service.bindMember(tank, 'run', 'dps-1', 'session-dps')
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', {
      id: 'task', runId: 'run', title: 'T', objective: 'T', inputs: [], constraints: [],
      acceptanceCriteria: [{ id: 'task:done', description: 'Done', required: true }],
      readScopes: ['tests/**'], writeScopes: ['tests/**'], blockedBy: [], expectedArtifacts: [],
      priority: 'normal', required: true, version: 1,
    })
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    const lease = service.claimTask({ sessionId: 'session-dps' }, 'run', 'task')
    service.submitExecution({ sessionId: 'session-dps' }, 'run', {
      taskId: 'task', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1', generation: 1, status: 'completed', summary: 'done',
      changedFiles: ['tests/dsh-tools.test.ts'], modifiedAssertions: [{ file: 'tests/dsh-tools.test.ts', reason: 'Updated assertions for the changed test behavior.' }], evidence: ['green'], commandsRun: [], risks: [], remainingWork: [],
    })
    service.changePhase(tank, 'run', 'VALIDATING')
    const manifest = service.createValidationManifest(tank, 'run', 'v1')

    const report = await submitTool.execute(
      {
        runId: 'run', verdict: 'fail', summary: 'artifact missing',
        checks: [{ criterionId: 'task:done', status: 'fail', evidence: ['file absent'] }],
        findings: [{
          id: 'F-1', severity: 'major', ownerTaskId: 'task',
          title: 'missing artifact', evidence: 'not on disk', remediation: 'redeliver',
        }],
      },
      execution('session-healer'),
    ) as unknown as { verdict: string, manifestVersion: number, workspaceFingerprint: string }

    expect(report.verdict).toBe('fail')
    expect(report.manifestVersion).toBe(manifest.manifestVersion)
    expect(report.workspaceFingerprint).toBe(manifest.workspaceFingerprint)
    expect(service.getRun('run').validationReports).toHaveLength(1)
  })
})

describe('boundedText hardening', () => {
  it('drops non-string values instead of implicitly stringifying them', () => {
    const hostile = { toString: () => 'x'.repeat(9_999) }
    expect(boundedText(42)).toBeUndefined()
    expect(boundedText(hostile)).toBeUndefined()
    expect(boundedText(['array'])).toBeUndefined()
    expect(boundedText(null)).toBeUndefined()
    expect(boundedText(true)).toBeUndefined()
    expect(boundedText(undefined)).toBeUndefined()
    expect(boundedText(Symbol('sym'))).toBeUndefined()
  })

  it('keeps legal strings unchanged and truncates oversize ones', () => {
    expect(boundedText('short')).toBe('short')
    expect(boundedText('')).toBe('')
    expect(boundedText('x'.repeat(500))).toBe('x'.repeat(500))
    expect(boundedText('x'.repeat(501))).toBe(`${'x'.repeat(500)}…`)
    expect(boundedText('x'.repeat(501), 100)).toBe(`${'x'.repeat(100)}…`)
  })
})

describe('run summary evidence bounding', () => {
  it('bounds health-signal evidence in party_status output by item count and length', async () => {
    const { service, definitions } = setup()
    const status = definitions.find((definition) => definition.name === 'party_status')!
    service.startRun({
      runId: 'run', objective: 'o', workspaceRoot: '/workspace', workspaceFingerprint: 'v1', tankSessionId: 'tank',
    })
    service.observeHealthSignal('run', {
      slot: 'tank',
      source: 'runtime',
      kind: 'tool-failure',
      severity: 'warning',
      windowMs: 120_000,
      // Oversized entries, non-string junk, and more entries than the
      // summary budget allows must all collapse into a bounded snapshot.
      evidence: [
        'x'.repeat(5_000),
        12_345,
        'y'.repeat(5_000),
        'z'.repeat(5_000),
        'w'.repeat(5_000),
        { note: 'object evidence' },
      ] as unknown as string[],
    })

    const result = await status.execute({ runId: 'run' }, execution('tank')) as {
      recentHealthSignals: Array<{ evidence: string[] }>
    }

    const evidence = result.recentHealthSignals[0]!.evidence
    expect(evidence).toEqual([`${'x'.repeat(200)}…`, `${'y'.repeat(200)}…`])
    for (const item of evidence) {
      expect(typeof item).toBe('string')
      expect(item.length).toBeLessThanOrEqual(201)
    }
  })

  it('bounds evidence lists accepted from tool input by item count and length', async () => {
    const { service, definitions } = setup()
    const start = definitions.find((definition) => definition.name === 'party_start')!
    const submit = definitions.find((definition) => definition.name === 'work_submit')!
    await start.execute({ runId: 'run', objective: 'Build', workspaceRoot: process.cwd() }, execution('tank'))
    const tank = { sessionId: 'tank' }
    service.bindMember(tank, 'run', 'healer', 'session-healer')
    service.bindMember(tank, 'run', 'dps-1', 'session-dps')
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', {
      id: 'task-1', runId: 'run', version: 1, title: 'Task', objective: 'Implement', inputs: [], constraints: [],
      acceptanceCriteria: [{ id: 'criterion-1', description: 'Done', required: true }], readScopes: [], writeScopes: [],
      globalCommands: [], blockedBy: [], expectedArtifacts: [], priority: 'normal', required: true,
    })
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task-1', 'dps-1')
    service.claimTask({ sessionId: 'session-dps' }, 'run', 'task-1')

    const submitted = await submit.execute({
      runId: 'run',
      report: {
        taskId: 'task-1',
        evidence: [
          ...Array.from({ length: 30 }, (_, index) => `entry-${index}-${'e'.repeat(600)}`),
        ],
      },
    }, execution('session-dps')) as { executionReports: Array<{ evidence: string[] }> }

    const evidence = submitted.executionReports[0]!.evidence
    expect(evidence).toHaveLength(20)
    for (const item of evidence) {
      expect(item.length).toBeLessThanOrEqual(501)
    }
    expect(evidence[0]).toBe(`entry-0-${'e'.repeat(492)}…`)
    expect(service.getRun('run').tasks['task-1']?.executionReports[0]?.evidence).toHaveLength(20)
  })
})

describe('session event type registration hardening', () => {
  it('never throws on frozen vocabularies and skips already-present types', () => {
    const frozen = Object.freeze(new Set<string>([...DUNGEON_SESSION_EVENT_TYPES]))
    expect(() => addDungeonTypes(frozen)).not.toThrow()
    expect([...frozen]).toEqual([...DUNGEON_SESSION_EVENT_TYPES])

    class CountingSet extends Set<string> {
      adds = 0
      override add(value: string): this {
        this.adds += 1
        return super.add(value)
      }
    }
    const counting = new CountingSet(['dungeon/event'])
    addDungeonTypes(counting)
    expect(counting.adds).toBe(1)
    expect([...counting]).toEqual([...DUNGEON_SESSION_EVENT_TYPES])

    // Repeated registration is a no-op once every type is known.
    addDungeonTypes(counting)
    expect(counting.adds).toBe(1)
    expect([...counting]).toEqual([...DUNGEON_SESSION_EVENT_TYPES])
  })

  it('degrades without throwing when the vocabulary rejects mutation, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const readOnly: ReadonlySet<string> = new Proxy(new Set<string>(), {
        get(target, property, receiver) {
          if (property === 'add') {
            return () => {
              throw new TypeError('Cannot add to a read-only vocabulary')
            }
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
        },
      })

      expect(() => addDungeonTypes(readOnly)).not.toThrow()
      expect(() => addDungeonTypes(readOnly)).not.toThrow()
      expect(readOnly.has('dungeon/event')).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('two-phase party_finish', () => {
  async function driveToValidatedRun(definitions: ToolDefinition[], service: DungeonService) {
    const start = definitions.find((definition) => definition.name === 'party_start')!
    const manifestTool = definitions.find((definition) => definition.name === 'validation_manifest')!
    const submitTool = definitions.find((definition) => definition.name === 'validation_submit')!
    const tank = { sessionId: 'tank' }
    await start.execute({ runId: 'run', objective: 'Build', workspaceRoot: process.cwd() }, execution('tank'))
    service.bindMember(tank, 'run', 'healer', 'session-healer')
    service.bindMember(tank, 'run', 'dps-1', 'session-dps')
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', {
      id: 'task', runId: 'run', title: 'T', objective: 'T', inputs: [], constraints: [],
      acceptanceCriteria: [{ id: 'task:done', description: 'Done', required: true }],
      readScopes: ['tests/**'], writeScopes: ['tests/**'], blockedBy: [], expectedArtifacts: [],
      priority: 'normal', required: true, version: 1,
    })
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    const lease = service.claimTask({ sessionId: 'session-dps' }, 'run', 'task')
    service.submitExecution({ sessionId: 'session-dps' }, 'run', {
      taskId: 'task', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
      slot: 'dps-1', generation: 1, status: 'completed', summary: 'done',
      changedFiles: ['tests/dsh-tools.test.ts'], modifiedAssertions: [{ file: 'tests/dsh-tools.test.ts', reason: 'Updated assertions for the changed test behavior.' }], evidence: ['green'], commandsRun: [], risks: [], remainingWork: [],
    })
    service.changePhase(tank, 'run', 'VALIDATING')
    await manifestTool.execute({ runId: 'run' }, execution('tank'))
    await submitTool.execute({
      runId: 'run', verdict: 'pass', summary: 'All required checks passed',
      checks: [{ criterionId: 'task:done', status: 'pass', evidence: ['verified'] }],
      findings: [],
    }, execution('session-healer'))
  }

  it('aborts completion when the workspace changes between validation and the recompute', async () => {
    const { service, definitions } = setup()
    const finish = definitions.find((definition) => definition.name === 'party_finish')!
    // party_start, validation_manifest, finishRun first computation, then the
    // recompute callback: the workspace "changes" inside that final window.
    fingerprintMock
      .mockImplementationOnce(() => 'fp-stable')
      .mockImplementationOnce(() => 'fp-stable')
      .mockImplementationOnce(() => 'fp-stable')
      .mockImplementationOnce(() => 'fp-externally-changed')

    await driveToValidatedRun(definitions, service)

    await expect(
      finish.execute({ runId: 'run', resultSummary: 'Shipped' }, execution('tank')),
    ).rejects.toMatchObject({ code: 'WORKSPACE_CHANGED_DURING_COMPLETION' })

    const after = service.getRun('run')
    expect(after.phase).toBe('VALIDATING')
    expect(after.validationReports.at(-1)?.status).toBe('stale')
  })

  it('completes the run when the recomputed fingerprint still matches', async () => {
    const { service, definitions } = setup()
    const finish = definitions.find((definition) => definition.name === 'party_finish')!
    fingerprintMock
      .mockImplementationOnce(() => 'fp-stable')
      .mockImplementationOnce(() => 'fp-stable')
      .mockImplementationOnce(() => 'fp-stable')
      .mockImplementationOnce(() => 'fp-stable')

    await driveToValidatedRun(definitions, service)

    const finished = await finish.execute({ runId: 'run', resultSummary: 'Shipped' }, execution('tank')) as {
      phase: string
    }
    expect(finished.phase).toBe('COMPLETED')
    expect(service.getRun('run').phase).toBe('COMPLETED')
  })
})
