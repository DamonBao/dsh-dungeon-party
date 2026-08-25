import type { SessionStore } from '@deepseek-ai/dsh-session';
import { type DungeonEvent, type DungeonEventStore, type DungeonRun } from '../service/dungeon-service.js';
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        'dungeon/event': DungeonEvent;
        'dungeon/projection': DungeonRun;
    }
}
export declare class SessionDungeonEventStore implements DungeonEventStore {
    private readonly sessions;
    private readonly runSessions;
    /** Per-run event index so load() stops rescanning/cloning the whole log. */
    private readonly eventCache;
    private readonly eventIndexes;
    private readonly cacheSessions;
    private readonly projectionCounters;
    private readonly lastProjectedPhase;
    /** Latest not-yet-published projection per run, for the trailing flush. */
    private readonly pendingProjections;
    private readonly projectionTimers;
    private static readonly PROJECTION_INTERVAL;
    private static readonly PROJECTION_TRAILING_MS;
    constructor(sessions: SessionStore);
    append(event: DungeonEvent): void;
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
    publishProjection(run: DungeonRun): void;
    /** Stop pending trailing flushes (plugin unload / tests). */
    dispose(): void;
    private flushProjection;
    listRunIds(): string[];
    loadAfter(runId: string, afterSequence: number): DungeonEvent[];
    load(runId: string): DungeonEvent[];
    private resolveSession;
}
