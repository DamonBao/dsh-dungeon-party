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
    private static readonly PROJECTION_INTERVAL;
    constructor(sessions: SessionStore);
    append(event: DungeonEvent): void;
    publishProjection(run: DungeonRun): void;
    listRunIds(): string[];
    loadAfter(runId: string, afterSequence: number): DungeonEvent[];
    load(runId: string): DungeonEvent[];
    private resolveSession;
}
