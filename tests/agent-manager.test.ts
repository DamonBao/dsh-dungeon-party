import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, type Mock } from 'vitest'

import { PartyAgentManager } from '../src/adapters/party-agent-manager.js'
import { DungeonService, type DungeonEvent, type WorkOrder } from '../src/service/dungeon-service.js'

function setup(workspaceRoot = '/workspace') {
  const events: DungeonEvent[] = []
  const service = new DungeonService({
    eventStore: {
      append: (event) => events.push(structuredClone(event)),
      load: (runId) => events.filter((event) => event.runId === runId).map((event) => structuredClone(event)),
    },
    idGenerator: (() => { let id = 0; return () => `id-${++id}` })(),
    clock: () => '2025-01-01T00:00:00.000Z',
  })
  service.startRun({
    runId: 'run', objective: 'Build', workspaceRoot, workspaceFingerprint: 'v1', tankSessionId: 'tank',
  })

  const restrictions: Array<{ allow?: string[]; deny?: string[] }> = []
  const sections: Array<{ name: string; text: string }> = []
  const on = vi.fn()
  const childContext = {
    on,
    tools: { restrict: (filter: { allow?: string[]; deny?: string[] }) => { restrictions.push(filter); return () => undefined } },
    systemPrompt: { section: (section: { name: string; text: string }) => { sections.push(section); return () => undefined } },
  }
  const dispose = vi.fn(async () => undefined)
  const send = vi.fn()
  const descriptorAppend = vi.fn()
  const childSession = { events: [] as Array<{ type: string }>, append: descriptorAppend }
  const cancel = vi.fn()
  const whenIdle = vi.fn(async () => undefined)
  const create = vi.fn(async (options: { setup?: (ctx: unknown) => unknown; sessionId: string }) => {
    await options.setup?.(childContext)
    return { agent: { id: options.sessionId, options: { provider: 'deepseek', model: 'deepseek-chat' }, send, cancel, whenIdle, session: childSession }, dispose }
  })
  const resume = vi.fn(async (options: { setup?: (ctx: unknown) => unknown; resumeSessionId: string }) => {
    await options.setup?.(childContext)
    return { agent: { id: options.resumeSessionId, options: { provider: 'deepseek', model: 'deepseek-chat' }, send, cancel, whenIdle, session: childSession }, dispose }
  })
  const tankCancel = vi.fn()
  const tankWhenIdle = vi.fn(async () => undefined)
  const tankSend = vi.fn()
  const tankAgent = {
    id: 'tank',
    options: { provider: 'deepseek', model: 'deepseek-chat' },
    ctx: { agents: { create, resume } },
    cancel: tankCancel,
    whenIdle: tankWhenIdle,
    send: tankSend,
  }
  const agents = { get: (id: string) => id === 'tank' ? tankAgent : undefined }
  const composeFrom = vi.fn(() => 'dungeon-party')
  const presets = { composeFrom }
  const manager = new PartyAgentManager(service, agents as never, presets as never)
  return {
    service, manager, agents, presets, create, resume, composeFrom, restrictions, sections, on, dispose,
    send, descriptorAppend, cancel, whenIdle, tankCancel, tankWhenIdle, tankSend,
  }
}

describe('PartyAgentManager', () => {
  it('pins child agents to the configured model route over inherited options', async () => {
    const { service, agents, presets, create } = setup()
    const manager = new PartyAgentManager(service, agents as never, presets as never, { provider: 'glm', model: 'glm-5.3-zp' })
    await manager.ensureMember({ sessionId: 'tank' }, 'run', 'dps-1')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      agentOptions: expect.objectContaining({ provider: 'glm', model: 'glm-5.3-zp' }),
    }))
  })

  it('creates and binds the healer before execution using inherited preset composition', async () => {
    const { service, manager, create, composeFrom, restrictions, sections } = setup()

    await manager.prepareForPhase({ sessionId: 'tank' }, 'run', 'EXECUTING')

    const run = service.getRun('run')
    expect(run.slots.healer).toMatchObject({ currentSessionId: 'run-healer-g1', generation: 1 })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'run-healer-g1',
      agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
      meta: expect.objectContaining({ cwd: '/workspace', parentSession: 'tank', origin: 'subagent', agentPreset: 'dungeon-party' }),
    }))
    expect(composeFrom).toHaveBeenCalledTimes(1)
    expect(restrictions.at(-1)?.allow).toEqual(expect.arrayContaining(['validation_manifest', 'validation_submit', 'battle_res']))
    expect(restrictions.at(-1)?.allow).not.toContain('party_finish')
    expect(sections.at(-1)?.text).toContain('Validator')
  })

  it('persists the official continuable subagent descriptor before child work', async () => {
    const { manager, descriptorAppend } = setup()

    await manager.ensureMember({ sessionId: 'tank' }, 'run', 'dps-1')

    expect(descriptorAppend).toHaveBeenCalledWith('subagent/descriptor', expect.objectContaining({
      version: 2,
      mode: 'continuable',
      provider: 'dungeon-party',
      label: expect.stringContaining('dps-1'),
      agentProvider: 'deepseek',
      agentModel: 'deepseek-chat',
    }))
  })

  it('proactively wakes the healer when validation starts', async () => {
    const { manager, send } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')

    await manager.prepareForPhase(tank, 'run', 'VALIDATING')

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ content: [expect.objectContaining({ text: expect.stringContaining('validation_manifest') })] }),
      'next-turn',
      true,
    )
  })

  it('lazily creates a DPS once and applies an executor-only dungeon tool surface', async () => {
    const { service, manager, create, restrictions, sections } = setup()

    await manager.ensureMember({ sessionId: 'tank' }, 'run', 'dps-1')
    await manager.ensureMember({ sessionId: 'tank' }, 'run', 'dps-1')

    expect(create).toHaveBeenCalledTimes(1)
    expect(service.getRun('run').slots['dps-1'].currentSessionId).toBe('run-dps-1-g1')
    expect(restrictions.at(-1)?.allow).toEqual(expect.arrayContaining(['work_claim', 'work_submit', 'member_checkpoint']))
    expect(restrictions.at(-1)?.allow).not.toContain('validation_submit')
    expect(sections.at(-1)?.text).toContain('Executor')
  })

  it('auto-dispatches ready work to free DPS slots after execution begins', async () => {
    const { service, manager, send } = setup()
    const tank = { sessionId: 'tank' }
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', {
      id: 'task-1', runId: 'run', version: 1, title: 'Forge the feature', objective: 'Implement it',
      inputs: [], constraints: [], acceptanceCriteria: [{ id: 'criterion-1', description: 'Done', required: true }],
      readScopes: ['src/**'], writeScopes: ['src/**'], globalCommands: [], blockedBy: [], expectedArtifacts: [],
      priority: 'normal', required: true,
    })
    await manager.prepareForPhase(tank, 'run', 'EXECUTING')
    service.changePhase(tank, 'run', 'EXECUTING')

    await manager.dispatchAvailableTasks(tank, 'run')

    expect(service.getRun('run').tasks['task-1']).toMatchObject({ ownerSlot: 'dps-1' })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ content: [expect.objectContaining({ text: expect.stringContaining('task-1') })] }),
      'next-turn',
      true,
    )
  })

  it('resumes a persisted bound child after manager restart instead of duplicating it', async () => {
    const { service, manager, agents, presets, resume, create } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'dps-1')
    const restarted = new PartyAgentManager(service, agents as never, presets as never)

    const sessionId = await restarted.ensureMember(tank, 'run', 'dps-1')

    expect(sessionId).toBe('run-dps-1-g1')
    expect(create).toHaveBeenCalledTimes(1)
    expect(resume).toHaveBeenCalledWith(expect.objectContaining({ resumeSessionId: 'run-dps-1-g1' }))
  })

  it('disposes only the run child agents when the party ends', async () => {
    const { manager, dispose } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')
    await manager.ensureMember(tank, 'run', 'dps-1')

    await manager.disposeRun('run')

    expect(dispose).toHaveBeenCalledTimes(2)
  })

  it('executes tank-directed healer maintenance on the original Session', async () => {
    const { service, manager, cancel, whenIdle, send } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')
    for (const kind of ['tool-failure', 'queue-pressure'] as const) {
      service.observeHealthSignal('run', {
        slot: 'healer', source: 'runtime', kind, severity: 'warning', windowMs: 60_000, evidence: [kind],
      })
    }

    await manager.executeValidatorMaintenance(tank, 'run')

    expect(cancel).toHaveBeenCalledWith(
      { kind: 'hook', reason: 'dungeon-party validator self-maintenance' },
      { keepInbox: true },
    )
    expect(whenIdle).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ content: [expect.objectContaining({ text: expect.stringContaining('member_self_maintain') })] }),
      'next-turn',
      true,
    )
  })

  it('wakes the healer for DPS and Commander resurrection work', async () => {
    const { service, manager, send } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')
    await manager.ensureMember(tank, 'run', 'dps-1')
    service.markMemberDown('run', 'dps-1', 'failed')
    const request = service.requestBattleRes(tank, 'run', 'dps-1', 'res-id')
    manager.dispatchBattleRes(tank, 'run', request.resurrectionId)
    const ticket = service.markCommanderUnavailable('run', 'failed')
    manager.dispatchCommanderRescue('run', ticket.ticketId)

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ content: [expect.objectContaining({ text: expect.stringContaining('res-id') })] }),
      'next-turn',
      true,
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ content: [expect.objectContaining({ text: expect.stringContaining(ticket.ticketId) })] }),
      'next-turn',
      true,
    )
  })

  it('cancels to idle and relays the resurrection packet when resuming a DPS', async () => {
    const { service, manager, cancel, whenIdle, send } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')
    await manager.ensureMember(tank, 'run', 'dps-1')
    service.markMemberDown('run', 'dps-1', 'driver failed')
    const request = service.requestBattleRes(tank, 'run', 'dps-1', 'resume-id')
    const healer = { sessionId: 'run-healer-g1' }
    service.startBattleRes(healer, 'run', request.resurrectionId)

    await manager.completeDpsResurrection(healer, 'run', request.resurrectionId, 'resume')

    expect(cancel).toHaveBeenCalledWith(
      { kind: 'hook', reason: 'dungeon-party battle resurrection resume' },
      { keepInbox: true },
    )
    expect(whenIdle).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ content: [expect.objectContaining({ text: expect.stringContaining('Resurrection packet') })] }),
      'next-turn',
      true,
    )
    expect(service.getRun('run').slots['dps-1'].lifeState).toBe('alive')
  })

  it('creates and atomically binds a replacement DPS for an authorized resurrection', async () => {
    const { service, manager, create } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')
    await manager.ensureMember(tank, 'run', 'dps-1')
    service.markMemberDown('run', 'dps-1', 'session corrupt')
    const request = service.requestBattleRes(tank, 'run', 'dps-1', 'resurrection')
    const healer = { sessionId: 'run-healer-g1' }
    service.startBattleRes(healer, 'run', request.resurrectionId)

    await manager.completeDpsResurrection(healer, 'run', request.resurrectionId, 'replace')

    expect(create).toHaveBeenCalledTimes(3)
    expect(service.getRun('run').slots['dps-1']).toMatchObject({
      currentSessionId: 'run-dps-1-g2', generation: 2, lifeState: 'alive',
    })
  })

  it('recovers a live original Commander and sends its durable checkpoint for review', async () => {
    const { service, manager, tankCancel, tankWhenIdle, tankSend } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')
    const ticket = service.markCommanderUnavailable('run', 'lead unavailable')
    const healer = { sessionId: 'run-healer-g1' }
    service.consumeCommanderRescueTicket(healer, 'run', ticket.ticketId)

    await manager.recoverCommander(healer, 'run', ticket.ticketId)

    expect(tankCancel).toHaveBeenCalledWith(
      { kind: 'hook', reason: 'dungeon-party commander recovery' },
      { keepInbox: true },
    )
    expect(tankWhenIdle).toHaveBeenCalledOnce()
    expect(service.getRun('run').controlState).toBe('recovering')
    expect(tankSend).toHaveBeenCalledWith(
      expect.objectContaining({ content: [expect.objectContaining({ text: expect.stringContaining('pendingDecisionIds') })] }),
      'next-turn',
      true,
    )
  })

  it('bridges a confirmed interrupt request to Agent cancellation and idle convergence', async () => {
    const { service, manager, cancel, whenIdle } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'dps-1')
    const request = vi.spyOn(service, 'requestTaskInterrupt').mockReturnValue({ ownerSlot: 'dps-1' } as never)
    const complete = vi.spyOn(service, 'completeTaskInterrupt').mockReturnValue({} as never)

    await manager.interruptTask(tank, 'run', 'task', 'turn-1')

    expect(request).toHaveBeenCalledWith(tank, 'run', 'task', 'turn-1')
    expect(cancel).toHaveBeenCalledWith(
      { kind: 'hook', reason: 'dungeon-party interrupt task task turn turn-1' },
      { keepInbox: true },
    )
    expect(whenIdle).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledWith('run', 'task', 'turn-1', { success: true, quarantinedFiles: [] })
  })

  it('routes structured member messages to the bound target Agent and audit log', async () => {
    const { service, manager, tankSend } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'dps-1')

    manager.sendPartyMessage({ sessionId: 'run-dps-1-g1' }, 'run', 'tank', {
      kind: 'blocked', summary: 'Need API decision', evidence: ['spec is ambiguous'],
    })

    expect(tankSend).toHaveBeenCalledWith(
      expect.objectContaining({ content: [expect.objectContaining({ text: expect.stringContaining('Need API decision') })] }),
      'next-step',
      true,
    )
    expect(service.getRun('run').messages).toHaveLength(1)
  })

  it('denies direct file tool calls outside the active lease writeScopes', async () => {
    const { service, manager, on } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')
    await manager.ensureMember(tank, 'run', 'dps-1')
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', {
      id: 'task', runId: 'run', title: 'Task', objective: 'Edit src', inputs: [], constraints: [],
      acceptanceCriteria: [{ id: 'done', description: 'Done', required: true }],
      readScopes: ['src/**'], writeScopes: ['src/**'], blockedBy: [], expectedArtifacts: [],
      priority: 'normal', required: true, version: 1,
    })
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    service.claimTask({ sessionId: 'run-dps-1-g1' }, 'run', 'task')
    const guard = on.mock.calls.find(([event]) => event === 'tools/pre-execute')?.[1]

    await expect(guard(
      { name: 'write', arguments: { file_path: 'README.md' } },
      vi.fn(async () => ({ kind: 'allow' })),
    )).resolves.toMatchObject({ kind: 'deny' })
  })

  it('allows safe git but denies destructive git under an active lease', async () => {
    const { service, manager, on } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')
    await manager.ensureMember(tank, 'run', 'dps-1')
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', {
      id: 'task', runId: 'run', title: 'Task', objective: 'Edit src', inputs: [], constraints: [],
      acceptanceCriteria: [{ id: 'done', description: 'Done', required: true }],
      readScopes: ['src/**'], writeScopes: ['src/**'], blockedBy: [], expectedArtifacts: [],
      priority: 'normal', required: true, version: 1,
    })
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    service.claimTask({ sessionId: 'run-dps-1-g1' }, 'run', 'task')
    const guard = on.mock.calls.find(([event]) => event === 'tools/pre-execute')?.[1]
    const next = vi.fn(async () => ({ kind: 'allow' }))

    // Safe git passes through to execution.
    await expect(guard({ name: 'bash', arguments: { command: 'git status --short' } }, next))
      .resolves.toMatchObject({ kind: 'allow' })
    await expect(guard({ name: 'bash', arguments: { command: 'git add src/index.ts' } }, next))
      .resolves.toMatchObject({ kind: 'allow' })
    await expect(guard({ name: 'bash', arguments: { command: 'git commit -m "work"' } }, next))
      .resolves.toMatchObject({ kind: 'allow' })
    await expect(guard({ name: 'bash', arguments: { command: 'git reset --soft HEAD~1' } }, next))
      .resolves.toMatchObject({ kind: 'allow' })

    // Content-rewriting git is intercepted before execution.
    for (const command of [
      'git reset --hard HEAD',
      'git clean -fd',
      'git checkout -- src/other.ts',
      'git restore src/other.ts',
      'git stash push',
      'git switch main',
    ]) {
      await expect(guard({ name: 'bash', arguments: { command } }, next))
        .resolves.toMatchObject({ kind: 'deny', reason: expect.stringContaining('Destructive git command denied') })
    }
  })

  it('installs the execution guard on a live agent restored in place', async () => {
    const { service, manager, agents, presets, on } = setup()
    const tank = { sessionId: 'tank' }
    await manager.ensureMember(tank, 'run', 'healer')
    await manager.ensureMember(tank, 'run', 'dps-1')
    service.changePhase(tank, 'run', 'PLANNING')
    service.createTask(tank, 'run', {
      id: 'task', runId: 'run', title: 'Task', objective: 'Edit src', inputs: [], constraints: [],
      acceptanceCriteria: [{ id: 'done', description: 'Done', required: true }],
      readScopes: ['src/**'], writeScopes: ['src/**'], blockedBy: [], expectedArtifacts: [],
      priority: 'normal', required: true, version: 1,
    })
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task', 'dps-1')
    service.claimTask({ sessionId: 'run-dps-1-g1' }, 'run', 'task')

    // Simulate a host restart: the agent is live in the registry with a fresh
    // context that never ran dungeon setup, while our handle map is cold.
    const on2 = vi.fn()
    const liveChild = {
      id: 'run-dps-1-g1',
      options: { provider: 'deepseek', model: 'deepseek-chat' },
      send: vi.fn(),
      cancel: vi.fn(),
      whenIdle: vi.fn(async () => undefined),
      session: { events: [] as Array<{ type: string }>, append: vi.fn() },
      ctx: { on: on2 },
    }
    const originalGet = agents.get.bind(agents)
    agents.get = ((id: string) => id === 'run-dps-1-g1' ? liveChild : originalGet(id)) as typeof agents.get

    const restarted = new PartyAgentManager(service, agents as never, presets as never)
    await restarted.restoreBoundParty(tank, 'run')

    const guard = on2.mock.calls.find(([event]) => event === 'tools/pre-execute')?.[1]
    expect(guard).toBeTypeOf('function')
    await expect(guard(
      { name: 'write', arguments: { file_path: 'README.md' } },
      vi.fn(async () => ({ kind: 'allow' })),
    )).resolves.toMatchObject({ kind: 'deny' })
    // The original creation-time guard is untouched (no duplicate install).
    expect(on.mock.calls.filter(([event]) => event === 'tools/pre-execute')).toHaveLength(1)
  })

  it('rejects host-observed workspace writes outside all active scopes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dungeon-audit-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'index.ts'), 'export {}\n')
    try {
      const { service, manager } = setup(root)
      const tank = { sessionId: 'tank' }
      await manager.ensureMember(tank, 'run', 'healer')
      await manager.ensureMember(tank, 'run', 'dps-1')
      service.changePhase(tank, 'run', 'PLANNING')
      service.createTask(tank, 'run', {
        id: 'task', runId: 'run', title: 'Task', objective: 'Edit src', inputs: [], constraints: [],
        acceptanceCriteria: [{ id: 'done', description: 'Done', required: true }],
        readScopes: ['src/**'], writeScopes: ['src/**'], blockedBy: [], expectedArtifacts: [],
        priority: 'normal', required: true, version: 1,
      })
      service.changePhase(tank, 'run', 'EXECUTING')
      service.assignTask(tank, 'run', 'task', 'dps-1')
      const dps = { sessionId: 'run-dps-1-g1' }
      const lease = service.claimTask(dps, 'run', 'task')
      manager.beginLeaseAudit(dps, 'run', 'task', lease.leaseId)
      writeFileSync(join(root, 'README.md'), 'escaped\n')

      expect(() => manager.auditWorkspaceBeforeSubmit(dps, 'run', {
        taskId: 'task', taskVersion: 1, leaseId: lease.leaseId, leaseVersion: lease.version,
        slot: 'dps-1', generation: 1, status: 'completed', summary: 'done', changedFiles: [],
        evidence: ['done'], commandsRun: [], risks: [], remainingWork: [],
      })).toThrowError(expect.objectContaining({ code: 'ACTUAL_WRITE_SCOPE_VIOLATION' }))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('re-baselines the lease audit when a checkpoint renews the lease', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dungeon-audit-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'index.ts'), 'export {}\n')
    try {
      const { service, manager } = setup(root)
      const tank = { sessionId: 'tank' }
      await manager.ensureMember(tank, 'run', 'healer')
      await manager.ensureMember(tank, 'run', 'dps-1')
      service.changePhase(tank, 'run', 'PLANNING')
      service.createTask(tank, 'run', {
        id: 'task', runId: 'run', title: 'Task', objective: 'Edit src', inputs: [], constraints: [],
        acceptanceCriteria: [{ id: 'done', description: 'Done', required: true }],
        readScopes: ['src/**'], writeScopes: ['src/**'], blockedBy: [], expectedArtifacts: [],
        priority: 'normal', required: true, version: 1,
      })
      service.changePhase(tank, 'run', 'EXECUTING')
      service.assignTask(tank, 'run', 'task', 'dps-1')
      const dps = { sessionId: 'run-dps-1-g1' }
      const lease = service.claimTask(dps, 'run', 'task')
      manager.beginLeaseAudit(dps, 'run', 'task', lease.leaseId)

      // External noise (e.g. another process) lands after the claim baseline.
      writeFileSync(join(root, 'README.md'), 'escaped\n')
      const report = (leaseVersion: number) => ({
        taskId: 'task', taskVersion: 1, leaseId: lease.leaseId, leaseVersion,
        slot: 'dps-1' as const, generation: 1, status: 'completed' as const, summary: 'done',
        changedFiles: [], evidence: ['done'], commandsRun: [], risks: [], remainingWork: [],
      })
      expect(() => manager.auditWorkspaceBeforeSubmit(dps, 'run', report(1)))
        .toThrowError(expect.objectContaining({ code: 'ACTUAL_WRITE_SCOPE_VIOLATION' }))

      // The DPS submits a checkpoint: the lease renews and the audit baseline
      // must reset so historical noise no longer blocks the submit.
      service.submitCheckpoint(dps, 'run', {
        checkpointId: 'cp-1', taskId: 'task', taskVersion: 1,
        leaseId: lease.leaseId, leaseVersion: 1, slot: 'dps-1',
        completed: ['step'], nextSteps: ['next'], evidenceDelta: ['progress'], blockers: [],
        workspaceFingerprint: 'v1',
      })
      manager.refreshLeaseAudit('run', 'task')
      expect(() => manager.auditWorkspaceBeforeSubmit(dps, 'run', report(2))).not.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('wakes the assigned DPS with a self-contained structured work order', async () => {
    const { service, manager, send } = setup()
    const tank = { sessionId: 'tank' }
    service.changePhase(tank, 'run', 'PLANNING')
    const order: WorkOrder = {
      id: 'task', runId: 'run', title: 'Implement', objective: 'Implement parser',
      inputs: ['docs/spec.md'], constraints: ['Use TDD'],
      acceptanceCriteria: [{ id: 'task:tests', description: 'Tests pass', required: true }],
      readScopes: ['src/**'], writeScopes: ['src/parser/**'], blockedBy: [],
      expectedArtifacts: ['src/parser/index.ts'], priority: 'high', required: true, version: 1,
    }
    service.createTask(tank, 'run', order)
    await manager.prepareForPhase(tank, 'run', 'EXECUTING')
    service.changePhase(tank, 'run', 'EXECUTING')
    await manager.ensureMember(tank, 'run', 'dps-1')
    service.assignTask(tank, 'run', 'task', 'dps-1')

    manager.dispatchTask(tank, 'run', 'task')

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        source: expect.objectContaining({ kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' }),
        content: [expect.objectContaining({ type: 'text', text: expect.stringContaining('Implement parser') })],
      }),
      'next-turn',
      true,
    )
  })
})

describe('PartyAgentManager drain notification', () => {
  function workOrderFor(id: string, overrides: Partial<WorkOrder> = {}): WorkOrder {
    return {
      id,
      runId: 'run',
      title: `Task ${id}`,
      objective: `Execute ${id}`,
      inputs: [],
      constraints: [],
      acceptanceCriteria: [{ id: `${id}:done`, description: 'Done', required: true }],
      readScopes: ['src/**'],
      writeScopes: [`src/${id}/**`],
      blockedBy: [],
      expectedArtifacts: [],
      priority: 'normal',
      required: true,
      version: 1,
      ...overrides,
    }
  }

  function reportFor(
    taskId: string,
    lease: { leaseId: string; version: number },
    status: 'completed' | 'blocked' | 'failed' = 'completed',
  ) {
    return {
      taskId,
      taskVersion: 1,
      leaseId: lease.leaseId,
      leaseVersion: lease.version,
      slot: 'dps-1' as const,
      generation: 1,
      status,
      summary: `reported ${status}`,
      changedFiles: [],
      evidence: ['evidence'],
      commandsRun: [],
      risks: [],
      remainingWork: [],
    }
  }

  function bindParty(service: DungeonService) {
    const tank = { sessionId: 'tank' }
    service.bindMember(tank, 'run', 'healer', 'healer-session')
    service.bindMember(tank, 'run', 'dps-1', 'dps-1-session')
    service.changePhase(tank, 'run', 'PLANNING')
    return tank
  }

  function submitTask(
    service: DungeonService,
    tank: { sessionId: string },
    taskId: string,
    status: 'completed' | 'blocked' | 'failed' = 'completed',
  ) {
    service.assignTask(tank, 'run', taskId, 'dps-1')
    const lease = service.claimTask({ sessionId: 'dps-1-session' }, 'run', taskId)
    service.submitExecution({ sessionId: 'dps-1-session' }, 'run', reportFor(taskId, lease, status))
  }

  const drainNotices = (tankSend: Mock): string[] =>
    tankSend.mock.calls
      .map((call) => String(call[0]?.content?.[0]?.text ?? ''))
      .filter((text) => text.includes('drained'))

  it('notifies the tank to open VALIDATING once execution drains', async () => {
    const { service, manager, tankSend } = setup()
    const tank = bindParty(service)
    service.createTask(tank, 'run', workOrderFor('task-1'))
    service.changePhase(tank, 'run', 'EXECUTING')
    submitTask(service, tank, 'task-1')

    await manager.kickScheduler('run')

    const notices = drainNotices(tankSend)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toContain('Run run ')
    expect(notices[0]).toContain('party_health')
    expect(notices[0]).toContain('party_phase VALIDATING')
    expect(tankSend).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ kind: 'plugin', plugin: 'dsh-dungeon-party', form: 'relay' }),
        content: [expect.objectContaining({ text: expect.stringContaining('VALIDATING') })],
      }),
      'next-step',
      true,
    )
    // The notice only suggests the transition; T still owns the state change.
    expect(service.getRun('run').phase).toBe('EXECUTING')
  })

  it('deduplicates drain notices per taskSetVersion and re-fires once after the task set changes', async () => {
    const { service, manager, tankSend } = setup()
    const tank = bindParty(service)
    service.createTask(tank, 'run', workOrderFor('task-1'))
    service.changePhase(tank, 'run', 'EXECUTING')
    submitTask(service, tank, 'task-1')

    await manager.kickScheduler('run')
    expect(drainNotices(tankSend)).toHaveLength(1)

    // Repeated kicks under the same task set stay quiet.
    await manager.kickScheduler('run')
    await manager.kickScheduler('run')
    expect(drainNotices(tankSend)).toHaveLength(1)

    // The task set changes: a repair round adds a follow-up work order.
    service.changePhase(tank, 'run', 'REPAIR')
    service.createTask(tank, 'run', workOrderFor('task-2'))
    submitTask(service, tank, 'task-2')

    await manager.kickScheduler('run')
    const notices = drainNotices(tankSend)
    expect(notices).toHaveLength(2)
    expect(notices[1]).toContain('party_health')
    expect(notices[1]).toContain('party_phase VALIDATING')
    // REPAIR drain guidance asks T to judge re-acceptance, not to finish.
    expect(notices[1]).toContain('re-acceptance')
    expect(notices[1]).toContain('not completion')

    // The new task set is deduplicated as well.
    await manager.kickScheduler('run')
    expect(drainNotices(tankSend)).toHaveLength(2)
  })

  it('stays silent while a task is still running', async () => {
    const { service, manager, tankSend } = setup()
    const tank = bindParty(service)
    service.createTask(tank, 'run', workOrderFor('task-1'))
    service.changePhase(tank, 'run', 'EXECUTING')
    service.assignTask(tank, 'run', 'task-1', 'dps-1')
    service.claimTask({ sessionId: 'dps-1-session' }, 'run', 'task-1')

    await manager.kickScheduler('run')

    expect(service.getRun('run').tasks['task-1']!.status).toBe('running')
    expect(drainNotices(tankSend)).toHaveLength(0)
  })

  it('stays silent while a ready task still waits on unmet dependencies', async () => {
    const { service, manager, tankSend } = setup()
    const tank = bindParty(service)
    service.createTask(tank, 'run', workOrderFor('core'))
    service.createTask(tank, 'run', workOrderFor('dep', { required: false }))
    service.createTask(tank, 'run', workOrderFor('child', { required: false, blockedBy: ['dep'] }))
    service.changePhase(tank, 'run', 'EXECUTING')
    submitTask(service, tank, 'core')
    submitTask(service, tank, 'dep', 'blocked')

    await manager.kickScheduler('run')

    // 'child' cannot be dispatched because 'dep' never completed, so the
    // schedulable pool is not empty and no drain notice may fire.
    expect(service.getRun('run').tasks.child!.status).toBe('pending')
    expect(drainNotices(tankSend)).toHaveLength(0)
  })

  it('stays silent while battle resurrection or validator maintenance is in flight', async () => {
    const { service, manager, tankSend } = setup()
    const tank = bindParty(service)
    service.createTask(tank, 'run', workOrderFor('task-1'))
    service.changePhase(tank, 'run', 'EXECUTING')
    submitTask(service, tank, 'task-1')
    service.markMemberDown('run', 'dps-1', 'runtime failure')
    service.requestBattleRes(tank, 'run', 'dps-1', 'res-1')

    await manager.kickScheduler('run')
    expect(drainNotices(tankSend)).toHaveLength(0)

    // A fresh run with an issued commander rescue ticket instead.
    const rescued = setup()
    const rescuedTank = bindParty(rescued.service)
    rescued.service.createTask(rescuedTank, 'run', workOrderFor('task-1'))
    rescued.service.changePhase(rescuedTank, 'run', 'EXECUTING')
    submitTask(rescued.service, rescuedTank, 'task-1')
    rescued.service.markCommanderUnavailable('run', 'tank offline')

    await rescued.manager.kickScheduler('run')
    expect(drainNotices(rescued.tankSend)).toHaveLength(0)

    // A fresh run with an issued validator maintenance instruction instead.
    const second = setup()
    const secondTank = bindParty(second.service)
    second.service.createTask(secondTank, 'run', workOrderFor('task-1'))
    second.service.changePhase(secondTank, 'run', 'EXECUTING')
    submitTask(second.service, secondTank, 'task-1')
    for (const kind of ['tool-failure', 'queue-pressure'] as const) {
      second.service.observeHealthSignal('run', {
        slot: 'healer', source: 'runtime', kind, severity: 'warning', windowMs: 60_000, evidence: [kind],
      })
    }
    second.service.directValidatorMaintenance(secondTank, 'run')

    await second.manager.kickScheduler('run')

    expect(drainNotices(second.tankSend)).toHaveLength(0)
  })

  it('stays silent when a required task was reported blocked or failed', async () => {
    const { service, manager, tankSend } = setup()
    const tank = bindParty(service)
    service.createTask(tank, 'run', workOrderFor('must'))
    service.createTask(tank, 'run', workOrderFor('maybe', { required: false }))
    service.changePhase(tank, 'run', 'EXECUTING')
    submitTask(service, tank, 'maybe')
    submitTask(service, tank, 'must', 'failed')

    await manager.kickScheduler('run')

    // No pending/ready/running task and no lease remain, but a required task
    // is not completed, so VALIDATING would be rejected and no notice fires.
    expect(service.getRun('run').tasks.must!.status).toBe('failed')
    expect(drainNotices(tankSend)).toHaveLength(0)
  })

  it('stays silent for an executing run whose task set is still empty', async () => {
    const { service, manager, tankSend } = setup()
    const tank = bindParty(service)
    service.changePhase(tank, 'run', 'EXECUTING')

    await manager.kickScheduler('run')

    expect(drainNotices(tankSend)).toHaveLength(0)
  })

  it('lets optional unfinished tasks pass the drain gate', async () => {
    const { service, manager, tankSend } = setup()
    const tank = bindParty(service)
    service.createTask(tank, 'run', workOrderFor('core'))
    service.createTask(tank, 'run', workOrderFor('stretch', { required: false }))
    service.createTask(tank, 'run', workOrderFor('spike', { required: false }))
    service.changePhase(tank, 'run', 'EXECUTING')
    submitTask(service, tank, 'core')
    submitTask(service, tank, 'stretch', 'blocked')
    submitTask(service, tank, 'spike', 'failed')

    await manager.kickScheduler('run')

    expect(service.getRun('run').tasks.stretch!.status).toBe('blocked')
    expect(service.getRun('run').tasks.spike!.status).toBe('failed')
    expect(drainNotices(tankSend)).toHaveLength(1)
    expect(drainNotices(tankSend)[0]).toContain('party_phase VALIDATING')
  })
})
