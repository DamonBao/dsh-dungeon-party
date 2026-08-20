import { useState, type CSSProperties } from 'react'
import type { ClientContext, ISessions, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import type { DungeonRun, PartySlot, TaskRecord } from '../src/service/dungeon-service.js'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    'dungeon-party': DungeonRun | null
  }
}

const slots: PartySlot[] = ['tank', 'dps-1', 'dps-2', 'dps-3', 'healer']
const roleNames: Record<PartySlot, string> = {
  tank: '指挥 T',
  'dps-1': 'DPS 1',
  'dps-2': 'DPS 2',
  'dps-3': 'DPS 3',
  healer: '验收奶',
}

const panelStyle: CSSProperties = {
  position: 'fixed', inset: 24, zIndex: 80, overflow: 'auto', padding: 24,
  borderRadius: 18, border: '1px solid color-mix(in srgb, CanvasText 18%, transparent)',
  background: 'color-mix(in srgb, Canvas 96%, transparent)', color: 'CanvasText',
  boxShadow: '0 24px 80px rgba(0,0,0,.35)', pointerEvents: 'auto',
}

function TaskRow({ task }: { task: TaskRecord }) {
  return <li style={{ padding: '10px 0', borderBottom: '1px solid color-mix(in srgb, CanvasText 12%, transparent)' }}>
    <strong>{task.workOrder.title}</strong> · {task.status} · {task.ownerSlot ?? '未分配'}
    <div style={{ opacity: .72, fontSize: 12 }}>
      Scope: {task.workOrder.writeScopes.join(', ') || '无'} · 优先级: {task.workOrder.priority}
    </div>
  </li>
}

interface DungeonPartyOverlayProps extends PropsRuntime<'shell.overlay'> {
  requestAction: (instruction: string) => Promise<boolean>
}

export function DungeonPartyOverlay({ useSessions, requestAction }: DungeonPartyOverlayProps) {
  const run = useSessions((state: SessionListState) => state.current
    ? state.byId[state.current]?.projectionValues?.['dungeon-party'] ?? null
    : null)
  const [open, setOpen] = useState(false)
  const [pendingInstruction, setPendingInstruction] = useState<string>()
  const [feedback, setFeedback] = useState<string>()
  const [isSubmitting, setSubmitting] = useState(false)
  if (!run) return null

  return <>
    <button
      type="button"
      aria-label="打开副本面板"
      onClick={() => setOpen(true)}
      style={{
        position: 'fixed', top: 14, right: 16, zIndex: 70, pointerEvents: 'auto',
        border: '1px solid color-mix(in srgb, CanvasText 18%, transparent)', borderRadius: 999,
        padding: '7px 12px', background: 'Canvas', color: 'CanvasText', cursor: 'pointer',
      }}
    >副本 · {run.phase}</button>
    {open ? <section role="dialog" aria-modal="true" aria-label="副本状态" style={panelStyle}>
      <header style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>五人本 · {run.phase}</h1>
          <p style={{ marginTop: 6, opacity: .72 }}>{run.objective}</p>
        </div>
        <button type="button" aria-label="关闭副本面板" onClick={() => setOpen(false)}>关闭</button>
      </header>

      <h2>队伍</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {slots.map((slot) => {
          const member = run.slots[slot]
          const task = Object.values(run.tasks).find((item) => item.ownerSlot === slot && item.status === 'running')
          return <article key={slot} style={{ padding: 14, borderRadius: 12, border: '1px solid color-mix(in srgb, CanvasText 14%, transparent)' }}>
            <strong>{roleNames[slot]}</strong>
            <div>{member.lifeState} · {member.readiness}</div>
            <small>generation {member.generation} · {member.activityState}</small>
            <div style={{ marginTop: 8 }}>{task?.workOrder.title ?? '当前无任务'}</div>
          </article>
        })}
      </div>

      <h2>任务</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>{Object.values(run.tasks).map((task) => <TaskRow key={task.workOrder.id} task={task} />)}</ul>

      <h2>验收与战复</h2>
      <p>验收报告 {run.validationReports.length} 份 · 战复剩余 {run.battleResChargesRemaining} · 指挥战复剩余 {run.commanderBattleResChargesRemaining}</p>

      <h2>承压与恢复</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => setPendingInstruction(
          '请检查所有疑似停滞的 DPS，按副本协议请求 lease-bound checkpoint，并根据证据决定缩小任务、中断或重派。',
        )}>请求停滞检查</button>
        <button type="button" onClick={() => setPendingInstruction(
          '请检查验收奶 readiness；若其 degraded 但仍响应，请调用 party_direct_recovery 指示原 Session 自我稳定。',
        )}>指示奶自我稳定</button>
        <button type="button" onClick={() => setPendingInstruction(
          '请检查 commanderLoad 和待决策队列；若承压，请暂停新派工并先清理关键决策，然后安全恢复派工。',
        )}>处理指挥承压</button>
      </div>
      {pendingInstruction ? <div role="alertdialog" aria-label="确认副本操作" style={{ marginTop: 12, padding: 12, border: '1px solid currentColor', borderRadius: 10 }}>
        <strong>确认影响</strong>
        <p>{pendingInstruction}</p>
        <button type="button" disabled={isSubmitting} onClick={async () => {
          setSubmitting(true)
          try {
            const accepted = await requestAction(pendingInstruction)
            setFeedback(accepted ? '已提交给当前指挥 Session。' : '提交失败，请查看当前 Session 状态。')
            setPendingInstruction(undefined)
          } finally {
            setSubmitting(false)
          }
        }}>确认提交</button>{' '}
        <button type="button" disabled={isSubmitting} onClick={() => setPendingInstruction(undefined)}>取消</button>
      </div> : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      <details>
        <summary>原始状态与事件证据</summary>
        <pre style={{ overflow: 'auto', fontSize: 11 }}>{JSON.stringify(run, null, 2)}</pre>
      </details>
    </section> : null}
  </>
}

export const inject = [
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-layout',
]

export function apply(ctx: ClientContext): void {
  const sessions = ctx.sessions as unknown as ISessions
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dungeon-party',
    order: 20,
    inject: () => ({
      requestAction: async (instruction: string) => {
        const current = sessions.list.getSnapshot().current
        const session = current ? sessions.binding(current)?.session : undefined
        if (!session) return false
        const result = await session.prompt([{ type: 'text', text: instruction }], 'queue')
        return result.ok
      },
    }),
  }, DungeonPartyOverlay))
}
