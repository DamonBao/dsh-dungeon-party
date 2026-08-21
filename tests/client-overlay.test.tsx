import { renderToStaticMarkup } from 'react-dom/server'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import { DungeonPartyOverlay } from '../client/index.js'
import { DungeonService } from '../src/service/dungeon-service.js'
import { MemoryDungeonEventStore } from '../src/service/memory-event-store.js'

function runProjection() {
  let id = 0
  const service = new DungeonService({
    eventStore: new MemoryDungeonEventStore(),
    clock: () => '2025-01-01T00:00:00.000Z',
    idGenerator: () => `event-${++id}`,
  })
  return service.startRun({
    runId: 'run-1', objective: 'Build safely', workspaceRoot: '/workspace',
    workspaceFingerprint: 'v1', tankSessionId: 'tank',
  })
}

describe('DungeonPartyOverlay', () => {
  it('stays absent outside dungeon sessions', () => {
    const html = renderToStaticMarkup(<DungeonPartyOverlay requestAction={async () => true} useSessions={(selector) => selector({
      ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })} useWorkspaces={(() => undefined) as never} />)
    expect(html).toBe('')
  })

  it('renders the phase trigger and accessible dungeon summary', () => {
    const run = runProjection()
    const html = renderToStaticMarkup(<DungeonPartyOverlay requestAction={async () => true} useSessions={(selector) => selector({
      ids: ['tank' as never],
      byId: {
        tank: {
          id: 'tank' as never, displayTitle: 'Tank', running: true, blank: false, updatedAt: 0,
          projectionValues: { 'dungeon-party': run },
        },
      } as never,
      current: 'tank' as never, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })} useWorkspaces={(() => undefined) as never} />)
    expect(html).toContain('集结队伍')
    expect(html).toContain('永夜堡垒 · 五人突击队')
    expect(html).toContain('守誓者 · Aegis')
    expect(html).toContain('圣谕者 · Lumina')
    expect(html).toContain('aria-label="打开副本面板"')
  })

  it('requires confirmation before queuing a recovery instruction', async () => {
    const run = runProjection()
    const requestAction = vi.fn(async () => true)
    const useSessions = ((selector: (state: never) => unknown) => selector({
      ids: ['tank'],
      byId: { tank: {
        id: 'tank', displayTitle: 'Tank', running: true, blank: false, updatedAt: 0,
        projectionValues: { 'dungeon-party': run },
      } },
      current: 'tank', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    } as never)) as never
    const renderer = create(<DungeonPartyOverlay
      requestAction={requestAction}
      useSessions={useSessions}
      useWorkspaces={(() => undefined) as never}
    />)

    act(() => renderer.root.findAllByType('button').find((button) => button.children.includes('指挥'))!.props.onClick())
    act(() => renderer.root.findAllByProps({ className: 'dp-button' })[1]!.props.onClick())
    expect(requestAction).not.toHaveBeenCalled()
    expect(renderer.root.findByProps({ role: 'alertdialog' })).toBeTruthy()

    await act(async () => renderer.root.findAllByType('button').find((button) => button.children.includes('确认提交'))!.props.onClick())
    expect(requestAction).toHaveBeenCalledOnce()
  })
})
