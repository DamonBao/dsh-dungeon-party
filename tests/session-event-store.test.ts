import { afterEach, describe, expect, it } from 'vitest'

import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'

import { SessionDungeonEventStore } from '../src/adapters/session-event-store.js'
import type { DungeonEvent, DungeonRun } from '../src/service/dungeon-service.js'

const roots: Context[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => root.fiber.dispose()))
})

describe('SessionDungeonEventStore', () => {
  it('persists dungeon events in the lead Session and cold-loads by run id', async () => {
    const root = new Context()
    roots.push(root)
    await root.plugin(SessionStore)
    root.sessions.create('tank' as never, { meta: { cwd: '/workspace' } })
    const store = new SessionDungeonEventStore(root.sessions)
    const event: DungeonEvent = {
      eventId: 'event-1',
      runId: 'run-1',
      sequence: 1,
      schemaVersion: 1,
      type: 'dungeon/run-created',
      actorSessionId: 'tank',
      occurredAt: '2025-01-01T00:00:00.000Z',
      payload: { objective: 'Build', optionalModelField: undefined },
    }

    store.append(event)
    expect(() => store.append({ ...event, eventId: 'event-2' })).toThrowError(
      expect.objectContaining({ code: 'EVENT_SEQUENCE_CONFLICT' }),
    )
    expect(() => store.append(event)).not.toThrow()
    store.publishProjection({ id: 'run-1' } as DungeonRun)

    const recreated = new SessionDungeonEventStore(root.sessions)
    expect(recreated.load('run-1')).toEqual([{
      ...event,
      payload: { objective: 'Build' },
    }])
    expect(recreated.listRunIds()).toEqual(['run-1'])
    expect(recreated.loadAfter('run-1', 0)).toEqual(recreated.load('run-1'))
    expect(recreated.loadAfter('run-1', 1)).toEqual([])
    expect(root.sessions.get('tank' as never)?.events.at(-1)?.type).toBe('dungeon/projection')
  })

  it('publishes full projections only on each run own interval', async () => {
    const root = new Context()
    roots.push(root)
    await root.plugin(SessionStore)
    root.sessions.create('tank' as never, { meta: { cwd: '/workspace' } })
    const store = new SessionDungeonEventStore(root.sessions)
    store.append({
      eventId: 'event-1', runId: 'run-1', sequence: 1, schemaVersion: 1,
      type: 'dungeon/run-created', actorSessionId: 'tank',
      occurredAt: '2025-01-01T00:00:00.000Z', payload: {},
    })
    store.append({
      eventId: 'event-2', runId: 'run-2', sequence: 1, schemaVersion: 1,
      type: 'dungeon/run-created', actorSessionId: 'tank',
      occurredAt: '2025-01-01T00:00:00.000Z', payload: {},
    })

    const session = root.sessions.get('tank' as never)!
    const projectionCount = (runId: string) => session.events.filter((event) =>
      event.type === 'dungeon/projection' && (event.data as DungeonRun).id === runId,
    ).length
    const run1 = { id: 'run-1', phase: 'EXECUTING' } as DungeonRun
    const run2 = { id: 'run-2', phase: 'EXECUTING' } as DungeonRun

    // Interleaving calls must not make one run consume another run's cadence.
    for (let call = 1; call <= 19; call += 1) {
      store.publishProjection(run1)
      store.publishProjection(run2)
    }
    expect(projectionCount('run-1')).toBe(1)
    expect(projectionCount('run-2')).toBe(1)

    store.publishProjection(run1)
    expect(projectionCount('run-1')).toBe(2)
    expect(projectionCount('run-2')).toBe(1)
    store.publishProjection(run2)
    expect(projectionCount('run-2')).toBe(2)
  })
})
