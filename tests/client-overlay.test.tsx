import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

import {
  DungeonPartyOverlay,
  OverlayErrorBoundary,
  formatTime,
  inject,
  memberMeters,
  validationCheckCounts,
  validationFindingGroups,
} from '../client/index.js'
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

function validationProjection() {
  const run = runProjection()
  run.phase = 'VALIDATING'
  run.taskSetVersion = 3
  run.tasks['client-panels'] = { workOrder: { id: 'client-panels', title: '客户端面板' } } as never
  run.validationReports.push(
    {
      runId: 'run-1', validationId: 'val-1', verdict: 'pass', status: 'stale',
      taskSetVersion: 2, manifestVersion: 1, workspaceFingerprint: 'fp-v1',
      checks: [{ criterionId: 'c1', status: 'pass', evidence: ['e1'] }],
      findings: [], summary: '首轮验收通过', createdAt: '2025-01-01T00:10:00.000Z',
    },
    {
      runId: 'run-1', validationId: 'val-2', verdict: 'fail', status: 'stale',
      taskSetVersion: 3, manifestVersion: 2, workspaceFingerprint: 'fp-v2',
      checks: [
        { criterionId: 'c1', status: 'pass', evidence: ['e1'] },
        { criterionId: 'c2', status: 'pass', evidence: ['e2'] },
        { criterionId: 'c3', status: 'fail', evidence: ['e3'] },
        { criterionId: 'c4', status: 'blocked', evidence: [] },
        { criterionId: 'c5', status: 'not-applicable', evidence: [], notApplicableReason: '范围外' },
        { criterionId: 'c6', status: 'not-applicable', evidence: [] },
      ],
      findings: [
        { id: 'f1', severity: 'critical', ownerTaskId: 'client-panels', title: '验收空态未被测试覆盖', evidence: 'coverage', remediation: '补用例' },
        { id: 'f2', severity: 'major', ownerTaskId: 'client-styles', title: '战复徽标在窄面板溢出', evidence: 'layout', remediation: '收紧间距' },
        { id: 'f3', severity: 'major', ownerTaskId: 'client-styles', title: '代数字号过小', evidence: 'a11y', remediation: '提升字号' },
        { id: 'f4', severity: 'minor', title: '时间戳未本地化', evidence: 'i18n', remediation: '格式化' },
      ],
      summary: '验收发现 4 项缺陷，其中 1 项致命', createdAt: '2025-01-01T00:20:00.000Z',
    },
  )
  run.battleResChargesRemaining = 1
  run.commanderBattleResChargesRemaining = 0
  run.resurrectionRequests.push(
    {
      resurrectionId: 'res-done', runId: 'run-1', targetSlot: 'dps-1', targetSessionId: 'dps-1-old',
      status: 'completed', requestedAt: '2025-01-01T00:05:00.000Z', expiresAt: '2025-01-01T00:10:00.000Z',
    },
    {
      resurrectionId: 'res-open', runId: 'run-1', targetSlot: 'dps-2', targetSessionId: 'dps-2',
      status: 'issued', requestedAt: '2025-01-01T00:21:00.000Z', expiresAt: '2025-01-01T00:26:00.000Z',
    },
  )
  run.commanderRescueTickets.push({
    ticketId: 'ticket-open', runId: 'run-1', targetSlot: 'tank', targetSessionId: 'tank',
    healerSessionId: 'healer', commanderCheckpointId: 'cp-9', status: 'consumed',
    issuedAt: '2025-01-01T00:22:00.000Z', expiresAt: '2025-01-01T00:27:00.000Z',
    recoveryExpiresAt: '2025-01-01T00:32:00.000Z', version: 1,
  })
  run.slots['dps-1'].generation = 2
  run.slots['dps-1'].history.push({
    sessionId: 'dps-1-old', generation: 1, boundAt: '2025-01-01T00:01:00.000Z',
    unboundAt: '2025-01-01T00:04:00.000Z', endReason: 'replaced',
  })
  return run
}

function overlayUseSessions(run: unknown) {
  return ((selector: (state: never) => unknown) => selector({
    ids: ['tank'],
    byId: {
      tank: {
        id: 'tank', displayTitle: 'Tank', running: true, blank: false, updatedAt: 0,
        projectionValues: { 'dungeon-party': run },
      },
    },
    current: 'tank', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  } as never)) as never
}

function renderOverlay(run: unknown): ReactTestRenderer {
  return create(<DungeonPartyOverlay
    requestAction={async () => true}
    useSessions={overlayUseSessions(run)}
  />)
}

function switchTab(renderer: ReactTestRenderer, label: string) {
  act(() => renderer.root.findAllByType('button').find((button) => button.children.includes(label))!.props.onClick())
}

function textOf(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string {
  if (node === null || node === undefined) return ''
  if (Array.isArray(node)) return node.map((item) => textOf(item)).filter((part) => part !== '').join(' ')
  const parts: string[] = []
  for (const child of node.children ?? []) {
    if (typeof child === 'string' || typeof child === 'number') parts.push(String(child))
    else parts.push(textOf(child))
  }
  return parts.join('')
}

describe('DungeonPartyOverlay', () => {
  it('waits for client Cordis services rather than package ids', () => {
    expect(inject).toEqual(['slots', 'sessions'])
  })

  it('maps role state to visible health, work meters, and activity labels', () => {
    const run = runProjection()
    Object.assign(run.slots['dps-1'], {
      currentSessionId: 'dps', lifeState: 'alive', readiness: 'healthy', activityState: 'running',
    })
    expect(memberMeters(run, 'dps-1')).toMatchObject({
      health: 100, resource: 88, resourceName: '任务输出', activityLabel: '执行中',
    })

    Object.assign(run.slots['dps-1'], { readiness: 'degraded', activityState: 'stopped' })
    expect(memberMeters(run, 'dps-1')).toMatchObject({ health: 68, resource: 14, activityLabel: '已停滞' })
    run.commanderLoad = 'pressured'
    expect(memberMeters(run, 'tank')).toMatchObject({ resource: 68, resourceName: '指挥压力' })
  })

  it('stays absent outside dungeon sessions', () => {
    const html = renderToStaticMarkup(<DungeonPartyOverlay requestAction={async () => true} useSessions={(selector) => selector({
      ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })} />)
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
    })} />)
    expect(html).toContain('集结队伍')
    expect(html).toContain('永夜堡垒 · 五人突击队')
    expect(html).toContain('守誓者 · Aegis')
    expect(html).toContain('圣谕者 · Lumina')
    expect(html).not.toContain('aria-label="打开副本面板"')
  })

  it('uses a compact width and supports dragging the panel header', () => {
    const run = runProjection()
    Object.assign(run.slots['dps-1'], {
      currentSessionId: 'dps', lifeState: 'alive', readiness: 'healthy', activityState: 'running',
    })
    const useSessions = ((selector: (state: never) => unknown) => selector({
      ids: ['tank'], byId: { tank: { id: 'tank', displayTitle: 'Tank', running: true, blank: false, updatedAt: 0,
        projectionValues: { 'dungeon-party': run } } }, current: 'tank', phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    } as never)) as never
    const renderer = create(<DungeonPartyOverlay requestAction={async () => true} useSessions={useSessions} />)
    const panel = renderer.root.findByProps({ role: 'dialog' })
    expect(panel.props.style).toMatchObject({ width: 348, height: 640, transform: 'translate3d(0px, 0px, 0)' })
    expect(renderer.root.findAll((node) => typeof node.props.className === 'string' && node.props.className.split(' ').includes('dp-member'))).toHaveLength(5)
    expect(renderer.root.findAllByProps({ 'aria-label': '打开副本面板' })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'data-activity': 'running' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '焰刃 · Pyra 任务输出' }).props['aria-valuenow']).toBe(88)

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
    expect(renderer.root.findByProps({ role: 'dialog' }).props.style.height).toBe(680)

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

  it('serializes raw projection data only after developer details open', () => {
    const renderer = renderOverlay(runProjection())
    switchTab(renderer, '指挥')
    const details = renderer.root.findByProps({ className: 'dp-raw' })
    expect(renderer.root.findAllByType('pre')).toHaveLength(0)
    act(() => details.props.onToggle({ currentTarget: { open: true } }))
    expect(renderer.root.findAllByType('pre')).toHaveLength(1)
    act(() => details.props.onToggle({ currentTarget: { open: false } }))
    expect(renderer.root.findAllByType('pre')).toHaveLength(0)
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
    />)

    act(() => renderer.root.findAllByType('button').find((button) => button.children.includes('指挥'))!.props.onClick())
    act(() => renderer.root.findAllByProps({ className: 'dp-button' })[1]!.props.onClick())
    expect(requestAction).not.toHaveBeenCalled()
    expect(renderer.root.findByProps({ role: 'alertdialog' })).toBeTruthy()

    await act(async () => renderer.root.findAllByType('button').find((button) => button.children.includes('确认提交'))!.props.onClick())
    expect(requestAction).toHaveBeenCalledOnce()
  })

  it('tallies malformed validation payloads defensively', () => {
    expect(validationCheckCounts(null)).toEqual({ pass: 0, fail: 0, blocked: 0, 'not-applicable': 0 })
    expect(validationCheckCounts({ checks: [{ status: 'pass' }, { status: 'weird' }, null] as never }))
      .toEqual({ pass: 1, fail: 0, blocked: 0, 'not-applicable': 0 })
    expect(validationFindingGroups(undefined)).toEqual([])
    const groups = validationFindingGroups([{ severity: 'critical' }, { severity: 'cosmic' }, null] as never)
    expect(groups.map((group) => [group.severity, group.label, group.findings.length])).toEqual([
      ['critical', '致命缺陷', 1],
      ['other', '其他发现', 1],
    ])
  })

  it('surfaces the latest validation report and battle resurrection status', () => {
    const renderer = renderOverlay(validationProjection())
    const validationTab = renderer.root.findByProps({ 'aria-label': '验收与战复面板' })
    expect(validationTab.props['data-active']).toBe(false)
    switchTab(renderer, '验收')
    expect(renderer.root.findByProps({ 'aria-label': '验收与战复面板' }).props['data-active']).toBe(true)
    const text = textOf(renderer.toJSON())

    // FR-062: latest report verdict, stale stamp, versions, check counts, severity groups
    expect(renderer.root.findByProps({ 'data-verdict': 'fail' })).toBeTruthy()
    expect(text).toContain('已失效')
    expect(text).toContain('任务集 v3 · 清单 v2')
    expect(text).toContain('验收发现 4 项缺陷，其中 1 项致命')
    expect(text).toContain('通过 2')
    expect(text).toContain('失败 1')
    expect(text).toContain('受阻 1')
    expect(text).toContain('不适用 2')
    expect(text).toContain('致命缺陷 · 1')
    expect(text).toContain('主要缺陷 · 2')
    expect(text).toContain('次要缺陷 · 1')
    expect(text).toContain('验收空态未被测试覆盖')
    expect(text).toContain('归属 客户端面板')
    expect(text).toContain('归属 client-styles')
    expect(text).toContain('归属 未归属任务')
    expect(text).not.toContain('首轮验收通过')
    expect(text).not.toContain('val-1')

    // FR-063: charges, in-flight requests and tickets, slot generations
    expect(renderer.root.findByProps({ 'aria-label': 'DPS 战复剩余 1' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '领队战复剩余 0' })).toBeTruthy()
    expect(text).toContain('影行者 · Nyx')
    expect(text).toContain('res-open')
    expect(text).toContain('已签发')
    expect(text).toContain('复活进行中')
    expect(text).toContain('ticket-open')
    expect(text).not.toContain('res-done')
    expect(text).toContain('G2')
    expect(text).toContain('历史 1')
  })

  it('falls back to graceful empty states without validation or resurrection data', () => {
    const renderer = renderOverlay(runProjection())
    switchTab(renderer, '验收')
    const text = textOf(renderer.toJSON())
    expect(text).toContain('奶尚未提交验收报告')
    expect(text).toContain('0 REPORTS')
    expect(text).toContain('暂无进行中的复活申请')
    expect(text).toContain('暂无进行中的紧急票据')
    expect(renderer.root.findByProps({ 'aria-label': 'DPS 战复剩余 1' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '领队战复剩余 1' })).toBeTruthy()
    expect(text).toContain('G1')
    expect(text).toContain('历史 0')
  })

  it('keeps rendering when the projection carries malformed validation data', () => {
    const run = runProjection()
    run.validationReports = [{ status: 'stale' }] as never
    run.resurrectionRequests = [{ status: 'issued' }] as never
    run.commanderRescueTickets = [{ status: 'consumed' }] as never
    run.battleResChargesRemaining = undefined as never
    run.commanderBattleResChargesRemaining = 'n/a' as never
    const renderer = renderOverlay(run)
    switchTab(renderer, '验收')
    const text = textOf(renderer.toJSON())
    expect(renderer.root.findByProps({ role: 'dialog' })).toBeTruthy()
    expect(text).toContain('未知结论')
    expect(text).toContain('已失效')
    expect(text).toContain('通过 0')
    expect(text).toContain('本轮检定未发现缺陷')
    expect(renderer.root.findByProps({ 'aria-label': 'DPS 战复剩余 0' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '领队战复剩余 0' })).toBeTruthy()
    expect(text).toContain('未知槽位')
    expect(text).toContain('已签发')
    expect(text).toContain('复活进行中')
  })

  it('drops pending confirmations when the projected run changes', () => {
    const run = runProjection()
    const renderer = renderOverlay(run)
    switchTab(renderer, '指挥')
    act(() => renderer.root.findAllByProps({ className: 'dp-button' })[0]!.props.onClick())
    expect(renderer.root.findByProps({ role: 'alertdialog' })).toBeTruthy()

    act(() => renderer.update(<DungeonPartyOverlay
      requestAction={async () => true}
      useSessions={overlayUseSessions({ ...run, id: 'run-2' })}
    />))

    expect(renderer.root.findAllByProps({ role: 'alertdialog' })).toHaveLength(0)
  })

  it('ignores submission results that arrive after the run changed', async () => {
    const run = runProjection()
    let resolveAction: ((value: boolean) => void) | undefined
    const requestAction = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveAction = resolve
    }))
    const renderer = create(<DungeonPartyOverlay
      requestAction={requestAction}
      useSessions={overlayUseSessions(run)}
    />)
    switchTab(renderer, '指挥')
    act(() => renderer.root.findAllByProps({ className: 'dp-button' })[0]!.props.onClick())
    await act(async () => {
      renderer.root.findAllByType('button').find((button) => button.children.includes('确认提交'))!.props.onClick()
    })
    expect(requestAction).toHaveBeenCalledOnce()

    // The user switches runs while the queue acknowledgement is in flight.
    act(() => renderer.update(<DungeonPartyOverlay
      requestAction={requestAction}
      useSessions={overlayUseSessions({ ...run, id: 'run-2' })}
    />))
    await act(async () => {
      resolveAction?.(true)
      await Promise.resolve()
    })

    expect(renderer.root.findAllByProps({ role: 'status' })).toHaveLength(0)
  })

  it('supports APG tab keyboard navigation and keyboard resizing', () => {
    const renderer = renderOverlay(runProjection())
    const tablist = renderer.root.findByProps({ role: 'tablist' })
    act(() => tablist.props.onKeyDown({ key: 'ArrowRight' }))
    expect(renderer.root.findByProps({ 'aria-label': '任务面板' }).props['aria-selected']).toBe(true)
    act(() => tablist.props.onKeyDown({ key: 'End' }))
    expect(renderer.root.findByProps({ 'aria-label': '指挥面板' }).props['aria-selected']).toBe(true)
    act(() => tablist.props.onKeyDown({ key: 'ArrowLeft' }))
    expect(renderer.root.findByProps({ 'aria-label': '验收与战复面板' }).props['aria-selected']).toBe(true)
    act(() => tablist.props.onKeyDown({ key: 'Home' }))
    expect(renderer.root.findByProps({ 'aria-label': '队伍面板' }).props['aria-selected']).toBe(true)
    expect(renderer.root.findByProps({ role: 'tabpanel' }).props['aria-labelledby']).toBe('dp-tab-party')

    const widthResize = renderer.root.findByProps({ 'aria-label': '调整副本面板宽度' })
    expect(widthResize.props['aria-valuenow']).toBe(348)
    act(() => widthResize.props.onKeyDown({ key: 'ArrowRight' }))
    expect(renderer.root.findByProps({ role: 'dialog' }).props.style.width).toBe(364)

    const heightResize = renderer.root.findByProps({ 'aria-label': '调整副本面板高度' })
    act(() => heightResize.props.onKeyDown({ key: 'ArrowDown' }))
    expect(renderer.root.findByProps({ role: 'dialog' }).props.style.height).toBe(656)
  })

  it('cancels open confirmations with Escape before closing the panel', () => {
    const renderer = renderOverlay(runProjection())
    switchTab(renderer, '指挥')
    act(() => renderer.root.findAllByProps({ className: 'dp-button' })[0]!.props.onClick())
    const dialog = () => renderer.root.findByProps({ role: 'dialog' })

    act(() => dialog().props.onKeyDown({ key: 'Escape' }))
    expect(renderer.root.findAllByProps({ role: 'alertdialog' })).toHaveLength(0)
    expect(dialog()).toBeTruthy()

    act(() => dialog().props.onKeyDown({ key: 'Escape' }))
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
  })

  it('contains render crashes in an error boundary and recovers on retry', () => {
    let shouldThrow = true
    function FlakyChild() {
      if (shouldThrow) throw new Error('projection exploded')
      return <div>recovered</div>
    }
    const renderer = create(<OverlayErrorBoundary><FlakyChild/></OverlayErrorBoundary>)
    expect(textOf(renderer.toJSON())).toContain('副本面板渲染失败')
    expect(textOf(renderer.toJSON())).toContain('projection exploded')

    shouldThrow = false
    const retry = renderer.root.findAllByType('button').find((button) => button.children.includes('重试渲染'))!
    act(() => retry.props.onClick())
    expect(textOf(renderer.toJSON())).toContain('recovered')
  })

  it('formats ISO timestamps defensively', () => {
    expect(formatTime(undefined)).toBe('—')
    expect(formatTime('not-a-date')).toBe('not-a-date')
    expect(formatTime('2025-01-01T00:10:00.000Z')).not.toBe('')
    expect(formatTime('2025-01-01T00:10:00.000Z')).not.toContain('T00:10:00.000Z')
  })
})
