import { describe, expect, it, vi } from 'vitest'

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'

import { DungeonService, type DungeonEvent } from '../src/service/dungeon-service.js'
import { registerDungeonTools } from '../src/tools/register.js'

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
      changedFiles: ['tests/dsh-tools.test.ts'], evidence: ['green'], commandsRun: [], risks: [], remainingWork: [],
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
