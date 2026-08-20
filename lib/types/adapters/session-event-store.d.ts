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
    constructor(sessions: SessionStore);
    append(event: DungeonEvent): void;
    publishProjection(run: DungeonRun): void;
    listRunIds(): string[];
    load(runId: string): DungeonEvent[];
    private resolveSession;
}
