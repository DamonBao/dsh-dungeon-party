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
  private readonly eventIndexes = new Map<string, Map<string, DungeonEvent>>()
  private readonly cacheSessions = new Map<string, Session>()
  private readonly projectionCounters = new Map<string, number>()
  private readonly lastProjectedPhase = new Map<string, string>()
  /** Latest not-yet-published projection per run, for the trailing flush. */
  private readonly pendingProjections = new Map<string, DungeonRun>()
  private readonly projectionTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private static readonly PROJECTION_INTERVAL = 20
  private static readonly PROJECTION_TRAILING_MS = 500

  constructor(private readonly sessions: SessionStore) {}

  append(event: DungeonEvent): void {
    const canonicalEvent = jsonClone(event)
    const existing = this.load(canonicalEvent.runId)
    const eventIndex = this.eventIndexes.get(canonicalEvent.runId) ?? new Map(existing.map((item) => [item.eventId, item]))
    this.eventIndexes.set(canonicalEvent.runId, eventIndex)
    const duplicate = eventIndex.get(canonicalEvent.eventId)
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
    eventIndex.set(canonicalEvent.eventId, canonicalEvent)
  }

  /**
   * Publish UI projections best-effort with eventual consistency.
   *
   * Projections feed only the Web overlay; durable state lives in
   * dungeon/event entries. Publish immediately on phase transitions (and
   * terminal phases) plus at most one full projection per PROJECTION_INTERVAL
   * calls, and guarantee the LAST state still reaches the UI via a bounded
   * trailing flush even when no further events happen. Publishing can never
   * throw into the caller: a projection failure must not flip an already
   * committed business command into an error.
   */
  publishProjection(run: DungeonRun): void {
    const projectionCounter = (this.projectionCounters.get(run.id) ?? 0) + 1
    this.projectionCounters.set(run.id, projectionCounter)
    const phase = run.phase
    const phaseChanged = !this.lastProjectedPhase.has(run.id) || this.lastProjectedPhase.get(run.id) !== phase
    const terminal = phase === 'COMPLETED' || phase === 'FAILED' || phase === 'CANCELLED'
    if (phaseChanged || terminal || projectionCounter % SessionDungeonEventStore.PROJECTION_INTERVAL === 0) {
      this.flushProjection(run.id, run)
      return
    }
    // Coalesced path: remember the newest state and make sure it lands within
    // the trailing window.
    this.pendingProjections.set(run.id, run)
    if (!this.projectionTimers.has(run.id)) {
      const timer = setTimeout(() => {
        this.projectionTimers.delete(run.id)
        const latest = this.pendingProjections.get(run.id)
        if (latest) this.flushProjection(run.id, latest)
      }, SessionDungeonEventStore.PROJECTION_TRAILING_MS)
      timer.unref?.()
      this.projectionTimers.set(run.id, timer)
    }
  }

  /** Stop pending trailing flushes (plugin unload / tests). */
  dispose(): void {
    for (const timer of this.projectionTimers.values()) clearTimeout(timer)
    this.projectionTimers.clear()
    this.pendingProjections.clear()
  }

  private flushProjection(runId: string, run: DungeonRun): void {
    const timer = this.projectionTimers.get(runId)
    if (timer) {
      clearTimeout(timer)
      this.projectionTimers.delete(runId)
    }
    this.pendingProjections.delete(runId)
    const session = this.resolveSession(runId)
    if (!session) return
    try {
      // Session.append validates, snapshots and freezes the JSON value, so an
      // extra JSON round-trip here would only duplicate work on the hot path.
      session.append('dungeon/projection', run)
      this.lastProjectedPhase.set(runId, run.phase)
    } catch {
      // Best-effort only: the durable event log already committed this state.
    }
  }

  listRunIds(): string[] {
    const runIds = new Set<string>()
    for (const session of this.sessions.list()) {
      for (const event of session.snapshotEvents()) {
        if (event.type === 'dungeon/event') runIds.add((event.data as DungeonEvent).runId)
      }
    }
    return [...runIds].sort()
  }

  loadAfter(runId: string, afterSequence: number): DungeonEvent[] {
    // Run sequences are contiguous and one-based, so the cursor is also the
    // zero-based slice offset. Return only the small unread tail.
    return this.load(runId).slice(afterSequence)
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
    for (const event of session.snapshotEvents()) {
      if (event.type !== 'dungeon/event') continue
      const dungeonEvent = event.data as DungeonEvent
      if (dungeonEvent.runId === runId) events.push(dungeonEvent)
    }
    events.sort((left, right) => left.sequence - right.sequence)
    this.eventCache.set(runId, events)
    this.eventIndexes.set(runId, new Map(events.map((event) => [event.eventId, event])))
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
      session.snapshotEvents().some((event) => event.type === 'dungeon/event' && event.data.runId === runId),
    )
  }
}
