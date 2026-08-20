import { describe, expect, it } from 'vitest'

import { DungeonService, type DungeonEvent } from '../src/service/dungeon-service.js'

function harness(config = {}) {
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
    runId: 'run',
    objective: 'Build',
    workspaceRoot: '/workspace',
    workspaceFingerprint: 'v1',
    tankSessionId: 'tank',
  })
  service.bindMember({ sessionId: 'tank' }, 'run', 'healer', 'healer')
  service.bindMember({ sessionId: 'tank' }, 'run', 'dps-1', 'dps-old')
  return { service, events, advance: (ms: number) => { now += ms } }
}

const tank = { sessionId: 'tank' }
const healer = { sessionId: 'healer' }
const outsider = { sessionId: 'outsider' }

describe('DPS battle resurrection', () => {
  it('sweeps expired resurrection and rescue state into terminal failures', () => {
    const { service, advance } = harness({
      resurrectionTimeoutMs: 1_000,
      commanderRescueTicketTtlMs: 1_000,
    })
    service.markMemberDown('run', 'dps-1', 'down')
    service.requestBattleRes(tank, 'run', 'dps-1', 'res-expired')
    const ticket = service.markCommanderUnavailable('run', 'tank down')
    advance(1_001)

    service.sweepExpiredState('run')

    const run = service.getRun('run')
    expect(run.resurrectionRequests[0]?.status).toBe('failed')
    expect(run.slots['dps-1'].lifeState).toBe('down')
    expect(run.commanderRescueTickets.find((item) => item.ticketId === ticket.ticketId)?.status).toBe('expired')
  })

  it('enforces tank authorization, healer consumption, and one charge reservation', () => {
    const { service } = harness()
    service.markMemberDown('run', 'dps-1', 'two consecutive timeouts')

    expect(() => service.requestBattleRes(outsider, 'run', 'dps-1', 'res-1')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
    const request = service.requestBattleRes(tank, 'run', 'dps-1', 'res-1')
    expect(request).toMatchObject({ status: 'issued', targetSlot: 'dps-1' })
    expect(service.getRun('run').battleResChargesRemaining).toBe(0)

    expect(() => service.startBattleRes(outsider, 'run', request.resurrectionId)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
    service.startBattleRes(healer, 'run', request.resurrectionId)
    expect(() => service.startBattleRes(healer, 'run', request.resurrectionId)).toThrowError(
      expect.objectContaining({ code: 'RESURRECTION_ALREADY_CONSUMED' }),
    )
  })

  it('atomically rebinds a replacement DPS and increments its generation', () => {
    const { service, events } = harness()
    service.markMemberDown('run', 'dps-1', 'session corrupt')
    const request = service.requestBattleRes(tank, 'run', 'dps-1', 'res-1')
    service.startBattleRes(healer, 'run', request.resurrectionId)

    service.completeBattleRes(healer, 'run', request.resurrectionId, {
      success: true,
      mode: 'replace',
      sessionId: 'dps-new',
    })

    const slot = service.getRun('run').slots['dps-1']
    expect(slot).toMatchObject({ currentSessionId: 'dps-new', generation: 2, lifeState: 'alive' })
    expect(slot.history.map((entry) => entry.sessionId)).toEqual(['dps-old', 'dps-new'])
    expect(events.filter((event) => event.type === 'dungeon/member-rebound')).toHaveLength(1)
  })
})

describe('commander emergency resurrection', () => {
  it('issues one bound ticket after checkpointing and lets only healer consume it', () => {
    const { service, events } = harness()

    const ticket = service.markCommanderUnavailable('run', 'lead session cannot continue')
    expect(ticket).toMatchObject({
      targetSlot: 'tank',
      targetSessionId: 'tank',
      healerSessionId: 'healer',
      status: 'issued',
    })
    expect(service.getRun('run').controlState).toBe('paused')
    expect(events.findIndex((event) => event.type === 'dungeon/commander-checkpointed')).toBeLessThan(
      events.findIndex((event) => event.type === 'dungeon/commander-rescue-ticket-issued'),
    )

    expect(() => service.consumeCommanderRescueTicket(outsider, 'run', ticket.ticketId)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
    service.consumeCommanderRescueTicket(healer, 'run', ticket.ticketId)
    expect(() => service.consumeCommanderRescueTicket(healer, 'run', ticket.ticketId)).toThrowError(
      expect.objectContaining({ code: 'TICKET_ALREADY_CONSUMED' }),
    )
  })

  it('expires an unconsumed ticket and releases its reserved commander charge', () => {
    const { service, advance } = harness({ commanderRescueTicketTtlMs: 1_000 })
    const ticket = service.markCommanderUnavailable('run', 'down')
    expect(service.getRun('run').commanderBattleResChargesRemaining).toBe(0)

    advance(1_001)
    service.expireCommanderRescueTickets('run')

    expect(service.getRun('run').commanderRescueTickets.find((item) => item.ticketId === ticket.ticketId)?.status).toBe('expired')
    expect(service.getRun('run').commanderBattleResChargesRemaining).toBe(1)
  })

  it('uses a separate completion timeout after a rescue ticket is consumed', () => {
    const { service, advance } = harness({
      commanderRescueTicketTtlMs: 1_000,
      commanderResurrectionTimeoutMs: 10_000,
    })
    const ticket = service.markCommanderUnavailable('run', 'down')
    service.consumeCommanderRescueTicket(healer, 'run', ticket.ticketId)
    advance(1_001)

    expect(() => service.completeCommanderResurrection(healer, 'run', ticket.ticketId, {
      success: true, sessionId: 'tank',
    })).not.toThrow()
  })

  it('restores only the original lead and stays recovering until tank resumes dispatch', () => {
    const { service } = harness()
    const ticket = service.markCommanderUnavailable('run', 'down')
    service.consumeCommanderRescueTicket(healer, 'run', ticket.ticketId)

    expect(() =>
      service.completeCommanderResurrection(healer, 'run', ticket.ticketId, {
        success: true,
        sessionId: 'replacement-tank',
      }),
    ).toThrowError(expect.objectContaining({ code: 'COMMANDER_REPLACE_FORBIDDEN' }))

    service.completeCommanderResurrection(healer, 'run', ticket.ticketId, {
      success: true,
      sessionId: 'tank',
    })
    expect(service.getRun('run').controlState).toBe('recovering')
    expect(service.getRun('run').slots.tank.currentSessionId).toBe('tank')

    service.resumeDispatch(tank, 'run')
    expect(service.getRun('run')).toMatchObject({ controlState: 'normal', commanderLoad: 'normal' })
  })
})
