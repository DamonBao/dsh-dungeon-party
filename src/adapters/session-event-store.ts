import type { Session, SessionStore } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'

import { DungeonError, type DungeonEvent, type DungeonEventStore, type DungeonRun } from '../service/dungeon-service.js'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'dungeon/event': DungeonEvent
    'dungeon/projection': DungeonRun
  }
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class SessionDungeonEventStore implements DungeonEventStore {
  private readonly runSessions = new Map<string, Session>()
  /** Per-run event index so load() stops rescanning/cloning the whole log. */
  private readonly eventCache = new Map<string, DungeonEvent[]>()
  private readonly cacheSessions = new Map<string, Session>()
  private projectionCounter = 0
  private readonly lastProjectedPhase = new Map<string, string>()
  private static readonly PROJECTION_INTERVAL = 20

  constructor(private readonly sessions: SessionStore) {}

  append(event: DungeonEvent): void {
    const canonicalEvent = jsonClone(event)
    const existing = this.load(canonicalEvent.runId)
    const duplicate = existing.find((item) => item.eventId === canonicalEvent.eventId)
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(canonicalEvent)) {
        throw new DungeonError('EVENT_ID_CONFLICT', `Event ${canonicalEvent.eventId} already exists with different content`)
      }
      return
    }
    const expectedSequence = (existing.at(-1)?.sequence ?? 0) + 1
    if (canonicalEvent.sequence !== expectedSequence) {
      throw new DungeonError('EVENT_SEQUENCE_CONFLICT', `Expected sequence ${expectedSequence}, received ${canonicalEvent.sequence}`)
    }
    const session = this.resolveSession(canonicalEvent.runId, canonicalEvent.actorSessionId)
    if (!session) {
      throw new Error(`Cannot persist dungeon run ${canonicalEvent.runId}: Lead Session is not live`)
    }
    session.append('dungeon/event', canonicalEvent)
    this.runSessions.set(canonicalEvent.runId, session)
    const cached = this.eventCache.get(canonicalEvent.runId)
    if (cached) cached.push(canonicalEvent)
    else this.eventCache.set(canonicalEvent.runId, [canonicalEvent])
  }

  publishProjection(run: DungeonRun): void {
    const session = this.resolveSession(run.id)
    if (!session) throw new Error(`Cannot publish dungeon run ${run.id}: Lead Session is not live`)
    // The projection only feeds the Web UI; durable state lives in
    // dungeon/event entries. Snapshot on phase transitions (and terminal
    // phases) plus at most one full projection per PROJECTION_INTERVAL calls
    // so per-event append cost no longer grows with run size.
    this.projectionCounter += 1
    const phase = run.phase
    const phaseChanged = !this.lastProjectedPhase.has(run.id) || this.lastProjectedPhase.get(run.id) !== phase
    const terminal = phase === 'COMPLETED' || phase === 'FAILED' || phase === 'CANCELLED'
    if (!phaseChanged && !terminal && this.projectionCounter % SessionDungeonEventStore.PROJECTION_INTERVAL !== 0) return
    session.append('dungeon/projection', jsonClone(run))
    this.lastProjectedPhase.set(run.id, phase)
  }

  listRunIds(): string[] {
    const runIds = new Set<string>()
    for (const session of this.sessions.list()) {
      for (const event of session.events) {
        if (event.type === 'dungeon/event') runIds.add((event.data as DungeonEvent).runId)
      }
    }
    return [...runIds].sort()
  }

  load(runId: string): DungeonEvent[] {
    const session = this.resolveSession(runId)
    if (!session) return []
    this.runSessions.set(runId, session)
    if (this.cacheSessions.get(runId) === session) {
      const cached = this.eventCache.get(runId)
      // Cached arrays are shared by reference; callers treat events as
      // immutable and the service canonicalizes before persisting.
      if (cached) return cached
    }
    const events: DungeonEvent[] = []
    for (const event of session.events) {
      if (event.type !== 'dungeon/event') continue
      const dungeonEvent = event.data as DungeonEvent
      if (dungeonEvent.runId === runId) events.push(dungeonEvent)
    }
    events.sort((left, right) => left.sequence - right.sequence)
    this.eventCache.set(runId, events)
    this.cacheSessions.set(runId, session)
    return events
  }

  private resolveSession(runId: string, actorSessionId?: string): Session | undefined {
    const cached = this.runSessions.get(runId)
    if (cached) return cached
    if (actorSessionId) {
      const actorSession = this.sessions.get(actorSessionId as SessionId)
      if (actorSession) return actorSession
    }
    return this.sessions.list().find((session) =>
      session.events.some((event) => event.type === 'dungeon/event' && event.data.runId === runId),
    )
  }
}
