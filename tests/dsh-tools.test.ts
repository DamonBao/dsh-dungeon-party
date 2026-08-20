import { describe, expect, it } from 'vitest'

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'

import { DungeonService, type DungeonEvent } from '../src/service/dungeon-service.js'
import { registerDungeonTools } from '../src/tools/register.js'

function setup() {
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
  const dispose = registerDungeonTools(context, service)
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
