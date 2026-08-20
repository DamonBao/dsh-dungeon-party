import { DungeonError, type DungeonEvent, type DungeonEventStore } from './dungeon-service.js'

export class MemoryDungeonEventStore implements DungeonEventStore {
  private readonly events: DungeonEvent[] = []

  append(event: DungeonEvent): void {
    const existing = this.events.filter((item) => item.runId === event.runId)
    const duplicate = existing.find((item) => item.eventId === event.eventId)
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(event)) {
        throw new DungeonError('EVENT_ID_CONFLICT', `Event ${event.eventId} already exists with different content`)
      }
      return
    }
    const expectedSequence = (existing.at(-1)?.sequence ?? 0) + 1
    if (event.sequence !== expectedSequence) {
      throw new DungeonError('EVENT_SEQUENCE_CONFLICT', `Expected sequence ${expectedSequence}, received ${event.sequence}`)
    }
    this.events.push(structuredClone(event))
  }

  listRunIds(): string[] {
    return [...new Set(this.events.map((event) => event.runId))].sort()
  }

  load(runId: string): DungeonEvent[] {
    return this.events
      .filter((event) => event.runId === runId)
      .map((event) => structuredClone(event))
  }
}
