import { afterEach, describe, expect, it } from 'vitest'

import { Context, Service } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'

import DungeonPartyService, { applyDungeonProjection } from '../src/plugin.js'

class TestAgentPresets extends Service {
  constructor(ctx: Context) {
    super(ctx, 'agentPresets')
  }

  composeFrom(): string {
    return 'dungeon-party'
  }
}

const roots: Context[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => root.fiber.dispose()))
})

describe('Cordis plugin', () => {
  it('folds whole-value dungeon projections for the web client', () => {
    const projected = { id: 'run-1', phase: 'EXECUTING' }
    expect(applyDungeonProjection(null, {
      type: 'dungeon/projection', data: projected,
    } as never)).toEqual(projected)
    expect(applyDungeonProjection(projected as never, {
      type: 'other', data: {},
    } as never)).toBe(projected)
  })

  it('publishes a loader schema for runtime dungeon configuration', async () => {
    const result = await DungeonPartyService.Config['~standard'].validate({
      dungeon: { maxConcurrentDps: 2, scopeEnforcementMode: 'serial' },
    })
    expect(result).toHaveProperty('value')
  })

  it('registers ctx.dungeonParty and owns its DSH tool lifecycle', async () => {
    const root = new Context()
    roots.push(root)
    await root.plugin(SessionStore)
    await root.plugin(SessionProjectionRegistry)
    await root.plugin(AgentRegistry)
    await root.plugin(TestAgentPresets)
    await root.plugin(SystemPrompt, {})
    await root.plugin(ToolRuntime, {})
    const fiber = await root.plugin(DungeonPartyService, {})

    expect(root.dungeonParty).toBeInstanceOf(DungeonPartyService)
    expect(root.tools.schemas().map((schema) => schema.name)).toContain('party_start')
    const tankSession = root.sessions.create('tank' as never, { meta: { cwd: '/workspace' } })
    root.dungeonParty.core.startRun({
      runId: 'run-projected', objective: 'Project', workspaceRoot: '/workspace',
      workspaceFingerprint: 'v1', tankSessionId: 'tank',
    })
    expect(root.sessionProjections.snapshot(tankSession).values['dungeon-party']).toMatchObject({
      id: 'run-projected', phase: 'FORMING',
    })
    // Session events feed the watchdog's activity signal, so long turns are
    // never mistaken for stalls while the member is still emitting events.
    expect(root.dungeonParty.agentManager.lastActivityAt('tank')).toBeTypeOf('number')

    await fiber.dispose()
    expect(root.tools.schemas().map((schema) => schema.name)).not.toContain('party_start')
  })
})
