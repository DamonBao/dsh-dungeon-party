import { type DungeonEvent, type DungeonEventStore } from './dungeon-service.js';
export declare class MemoryDungeonEventStore implements DungeonEventStore {
    private readonly events;
    append(event: DungeonEvent): void;
    listRunIds(): string[];
    load(runId: string): DungeonEvent[];
}
