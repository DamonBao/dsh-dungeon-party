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

  it('treats the outer runId as authoritative when creating a work order', async () => {
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
        id: 'task-1', runId: 'stale-model-value', title: 'Task', objective: 'Implement',
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
})
