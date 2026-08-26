import { describe, expect, it, vi } from 'vitest'

import { PartyAgentManager } from '../src/adapters/party-agent-manager.js'
import { DungeonService, type DungeonEvent, type WorkOrder } from '../src/service/dungeon-service.js'

function setup(config = {}) {
  let id = 0
  let now = Date.parse('2025-01-01T00:00:00.000Z')
  const events: DungeonEvent[] = []
  const service = new DungeonService({
    eventStore: {
      append: (event) => events.push(structuredClone(event)),
      load: (runId) => events.filter((event) => event.runId === runId).map((event) => structuredClone(event)),
    },
    idGenerator: () => `id-${++id}`,
    clock: () => new Date(now).toISOString(),
    config,
  })
  service.startRun({
    runId: 'run', objective: 'Build', workspaceRoot: '/workspace', workspaceFingerprint: 'v1', tankSessionId: 'tank',
  })

  const childContext = {
    on: vi.fn(),
    tools: { restrict: () => () => undefined },
    systemPrompt: { section: () => () => undefined },
  }
  const send = vi.fn()
  const tankSend = vi.fn()
  const childSession = { events: [] as Array<{ type: string }>, append: vi.fn() }
  const makeAgent = (id: string) => ({
    id,
    options: { provider: 'deepseek', model: 'deepseek-chat' },
    send,
    cancel: vi.fn(),
    whenIdle: vi.fn(async () => undefined),
    session: childSession,
  })
  const create = vi.fn(async (options: { setup?: (ctx: unknown) => unknown; sessionId: string }) => {
    await options.setup?.(childContext)
    return { agent: makeAgent(options.sessionId), dispose: vi.fn(async () => undefined) }
  })
  const resume = vi.fn(async (options: { setup?: (ctx: unknown) => unknown; resumeSessionId: string }) => {
    await options.setup?.(childContext)
    return { agent: makeAgent(options.resumeSessionId), dispose: vi.fn(async () => undefined) }
  })
  const tankAgent = {
    id: 'tank',
    options: { provider: 'deepseek', model: 'deepseek-chat' },
    ctx: { agents: { create, resume } },
    cancel: vi.fn(),
    whenIdle: vi.fn(async () => undefined),
    send: tankSend,
  }
  const agents = { get: (id: string) => id === 'tank' ? tankAgent : undefined }
  const manager = new PartyAgentManager(service, agents as never, { composeFrom: vi.fn() } as never, {}, () => now)
  return {
    service, manager, send, create,
    advance(ms: number) { now += ms },
    sentTexts: () => send.mock.calls.map((call) => String(call[0]?.content?.[0]?.text ?? '')),
    tankTexts: () => tankSend.mock.calls.map((call) => String(call[0]?.content?.[0]?.text ?? '')),
  }
}

function workOrder(): WorkOrder {
  return {
    id: 'task',
    runId: 'run',
    title: 'Execute',
    objective: 'Execute task',
    inputs: [],
    constraints: [],
    acceptanceCriteria: [{ id: 'task:done', description: 'Done', required: true }],
    readScopes: ['src/**'],
    writeScopes: ['src/**'],
    blockedBy: [],
    expectedArtifacts: [],
    priority: 'normal',
    required: true,
    version: 1,
  }
}

const tank = { sessionId: 'tank' }

function serviceParty(service: DungeonService) {
  const dps = { sessionId: 'dps' }
  service.bindMember(tank, 'run', 'healer', 'healer')
  service.bindMember(tank, 'run', 'dps-1', dps.sessionId)
  service.changePhase(tank, 'run', 'PLANNING')
  service.createTask(tank, 'run', workOrder())
  service.changePhase(tank, 'run', 'EXECUTING')
  service.assignTask(tank, 'run', 'task', 'dps-1')
  return { lease: service.claimTask(dps, 'run', 'task'), dps }
}

async function managedParty(service: DungeonService, manager: PartyAgentManager) {
  service.bindMember(tank, 'run', 'healer', 'healer')
  await manager.ensureMember(tank, 'run', 'dps-1')
  service.changePhase(tank, 'run', 'PLANNING')
  service.createTask(tank, 'run', workOrder())
  service.changePhase(tank, 'run', 'EXECUTING')
  service.assignTask(tank, 'run', 'task', 'dps-1')
  return service.claimTask({ sessionId: 'run-dps-1-g1' }, 'run', 'task')
}

describe('watchdog recovery semantics', () => {
  it('returns an expired-lease task to the schedulable pool without an owner', () => {
    const { service, advance } = setup()
    serviceParty(service)

    advance(601_000)
    service.sweepExpiredState('run')

    const task = service.getRun('run').tasks.task!
    expect(task.activeLease).toBeUndefined()
    expect(task.status).toBe('ready')
    expect(task.ownerSlot).toBeUndefined()
  })

  it('keeps member-down revocations owned so battle res keeps its target', () => {
    const { service } = setup()
    serviceParty(service)

    service.markMemberDown('run', 'dps-1', 'failed')

    const task = service.getRun('run').tasks.task!
    expect(task.activeLease).toBeUndefined()
    expect(task.status).toBe('ready')
    expect(task.ownerSlot).toBe('dps-1')
  })

  it('clears the stalled flag once the DPS finally submits its report', () => {
    const { service, advance } = setup()
    const { lease, dps } = serviceParty(service)

    advance(241_000)
    service.evaluateTaskProgress('run', 'task', {})
    advance(241_000)
    service.evaluateTaskProgress('run', 'task', {})
    expect(service.getRun('run').tasks.task!.progressState).toBe('stalled')

    service.submitExecution(dps, 'run', {
      taskId: 'task',
      taskVersion: 1,
      leaseId: lease.leaseId,
      leaseVersion: lease.version,
      slot: 'dps-1',
      generation: 1,
      status: 'completed',
      summary: 'implemented',
      changedFiles: [],
      evidence: ['tests passed'],
      commandsRun: [],
      risks: [],
      remainingWork: [],
    })

    const task = service.getRun('run').tasks.task!
    expect(task.status).toBe('completed')
    expect(task.progressState).toBe('on-track')
  })

  it('escalates a stalled task: checkpoint nudge first, tank alert once confirmed', async () => {
    const { service, manager, advance, sentTexts, tankTexts } = setup()
    await managedParty(service, manager)

    advance(241_000)
    await manager.runWatchdog()
    expect(service.getRun('run').tasks.task!.progressState).toBe('suspected-stalled')
    expect(sentTexts().some((text) => text.includes('Checkpoint requested'))).toBe(true)
    expect(tankTexts().length).toBe(0)

    advance(241_000)
    await manager.runWatchdog()
    expect(service.getRun('run').tasks.task!.progressState).toBe('stalled')
    expect(tankTexts().some((text) => text.includes('stall confirmed'))).toBe(true)
  })

  it('notifies the DPS and redispatches when a lease expires', async () => {
    const { service, manager, advance, sentTexts } = setup()
    await managedParty(service, manager)

    advance(700_000)
    await manager.runWatchdog()

    const task = service.getRun('run').tasks.task!
    expect(task.activeLease).toBeUndefined()
    expect(task.status).toBe('ready')
    expect(task.ownerSlot).toBe('dps-1')
    expect(sentTexts().some((text) => text.includes('expired and was revoked'))).toBe(true)
    expect(sentTexts().some((text) => text.includes('Assigned dungeon-party work order'))).toBe(true)
  })

  it('does not stall a leased task whose owner session showed recent activity', async () => {
    const { service, manager, advance } = setup()
    await managedParty(service, manager)

    advance(241_000)
    // The DPS turn is long, but the session is still emitting activity.
    manager.observeSessionActivity('run-dps-1-g1')
    await manager.runWatchdog()

    expect(service.getRun('run').tasks.task!.progressState).toBe('on-track')
    expect(service.getRun('run').tasks.task!.missedCheckpoints).toBe(0)
  })

  it('stalls once the owner session stays quiet beyond the activity window', async () => {
    const { service, manager, advance } = setup()
    await managedParty(service, manager)

    manager.observeSessionActivity('run-dps-1-g1')
    advance(241_000)
    await manager.runWatchdog()

    expect(service.getRun('run').tasks.task!.progressState).toBe('suspected-stalled')
  })

  it('includes the exact active turn id in the confirmed stall alert so party_interrupt is actionable', async () => {
    const { service, manager, advance, tankTexts } = setup()
    await managedParty(service, manager)
    service.registerTaskTurn('run', 'task', 'turn-9')

    advance(241_000)
    await manager.runWatchdog()
    advance(241_000)
    await manager.runWatchdog()

    expect(service.getRun('run').tasks.task!.progressState).toBe('stalled')
    expect(tankTexts().some((text) => text.includes('stall confirmed') && text.includes('turn-9'))).toBe(true)
  })

  it('nudges a DPS that ended its turn on a dangling lease, rate-limited', async () => {    const { service, manager, send, sentTexts } = setup()
    await managedParty(service, manager)

    manager.nudgeAfterTurnEnd('run-dps-1-g1')
    expect(sentTexts().some((text) => text.includes('turn ended while'))).toBe(true)

    const afterFirst = send.mock.calls.length
    manager.nudgeAfterTurnEnd('run-dps-1-g1')
    manager.nudgeAfterTurnEnd('tank')
    expect(send.mock.calls.length).toBe(afterFirst)
  })
})
