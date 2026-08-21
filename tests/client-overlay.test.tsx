import { renderToStaticMarkup } from 'react-dom/server'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import { DungeonPartyOverlay, inject } from '../client/index.js'
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
  it('waits for client Cordis services rather than package ids', () => {
    expect(inject).toEqual(['slots', 'sessions'])
  })

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
    expect(html).not.toContain('aria-label="打开副本面板"')
  })

  it('uses a compact width and supports dragging the panel header', () => {
    const run = runProjection()
    const useSessions = ((selector: (state: never) => unknown) => selector({
      ids: ['tank'], byId: { tank: { id: 'tank', displayTitle: 'Tank', running: true, blank: false, updatedAt: 0,
        projectionValues: { 'dungeon-party': run } } }, current: 'tank', phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    } as never)) as never
    const renderer = create(<DungeonPartyOverlay requestAction={async () => true} useSessions={useSessions} useWorkspaces={(() => undefined) as never} />)
    const panel = renderer.root.findByProps({ role: 'dialog' })
    expect(panel.props.style).toMatchObject({ width: 348, height: 600, transform: 'translate3d(0px, 0px, 0)' })
    expect(renderer.root.findAll((node) => typeof node.props.className === 'string' && node.props.className.split(' ').includes('dp-member'))).toHaveLength(5)
    expect(renderer.root.findAllByProps({ 'aria-label': '打开副本面板' })).toHaveLength(0)

    const header = renderer.root.findByProps({ className: 'dp-header' })
    const capture = vi.fn()
    act(() => header.props.onPointerDown({ button: 0, pointerId: 1, clientX: 100, clientY: 80, currentTarget: { setPointerCapture: capture } }))
    act(() => header.props.onPointerMove({ pointerId: 1, clientX: 125, clientY: 110 }))
    expect(renderer.root.findByProps({ role: 'dialog' }).props.style.transform).toBe('translate3d(25px, 30px, 0)')
    expect(capture).toHaveBeenCalledWith(1)

    const resize = renderer.root.findByProps({ 'aria-label': '调整副本面板宽度' })
    act(() => resize.props.onPointerDown({ button: 0, pointerId: 2, clientX: 100, stopPropagation: vi.fn(), currentTarget: { setPointerCapture: vi.fn() } }))
    act(() => resize.props.onPointerMove({ pointerId: 2, clientX: 28 }))
    expect(renderer.root.findByProps({ role: 'dialog' }).props.style.width).toBe(420)

    const heightResize = renderer.root.findByProps({ 'aria-label': '调整副本面板高度' })
    act(() => heightResize.props.onPointerDown({ button: 0, pointerId: 3, clientY: 100, stopPropagation: vi.fn(), currentTarget: { setPointerCapture: vi.fn() } }))
    act(() => heightResize.props.onPointerMove({ pointerId: 3, clientY: 140 }))
    expect(renderer.root.findByProps({ role: 'dialog' }).props.style.height).toBe(640)

    act(() => renderer.root.findByProps({ 'aria-label': '关闭副本面板' }).props.onClick({ stopPropagation: vi.fn() }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    const launcher = renderer.root.findByProps({ 'aria-label': '打开副本面板' })
    act(() => launcher.props.onPointerDown({ button: 0, pointerId: 4, clientX: 100, clientY: 40, currentTarget: { setPointerCapture: vi.fn() } }))
    act(() => launcher.props.onPointerMove({ pointerId: 4, clientX: 75, clientY: 60 }))
    expect(renderer.root.findByProps({ 'aria-label': '打开副本面板' }).props.style.transform).toBe('translate3d(-25px, 20px, 0)')
    act(() => launcher.props.onPointerUp({ pointerId: 4 }))
    act(() => launcher.props.onClick())
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    act(() => renderer.root.findByProps({ 'aria-label': '打开副本面板' }).props.onClick())
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
    expect(renderer.root.findAllByProps({ 'aria-label': '打开副本面板' })).toHaveLength(0)
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
