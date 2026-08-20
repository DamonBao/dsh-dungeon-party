import { DungeonError } from '../service/dungeon-service.js';
export class SessionDungeonEventStore {
    sessions;
    runSessions = new Map();
    constructor(sessions) {
        this.sessions = sessions;
    }
    append(event) {
        const existing = this.load(event.runId);
        const duplicate = existing.find((item) => item.eventId === event.eventId);
        if (duplicate) {
            if (JSON.stringify(duplicate) !== JSON.stringify(event)) {
                throw new DungeonError('EVENT_ID_CONFLICT', `Event ${event.eventId} already exists with different content`);
            }
            return;
        }
        const expectedSequence = (existing.at(-1)?.sequence ?? 0) + 1;
        if (event.sequence !== expectedSequence) {
            throw new DungeonError('EVENT_SEQUENCE_CONFLICT', `Expected sequence ${expectedSequence}, received ${event.sequence}`);
        }
        const session = this.resolveSession(event.runId, event.actorSessionId);
        if (!session) {
            throw new Error(`Cannot persist dungeon run ${event.runId}: Lead Session is not live`);
        }
        session.append('dungeon/event', structuredClone(event));
        this.runSessions.set(event.runId, session);
    }
    publishProjection(run) {
        const session = this.resolveSession(run.id);
        if (!session)
            throw new Error(`Cannot publish dungeon run ${run.id}: Lead Session is not live`);
        session.append('dungeon/projection', structuredClone(run));
    }
    listRunIds() {
        const runIds = new Set();
        for (const session of this.sessions.list()) {
            for (const event of session.events) {
                if (event.type === 'dungeon/event')
                    runIds.add(event.data.runId);
            }
        }
        return [...runIds].sort();
    }
    load(runId) {
        const session = this.resolveSession(runId);
        if (!session)
            return [];
        this.runSessions.set(runId, session);
        const events = [];
        for (const event of session.events) {
            if (event.type !== 'dungeon/event')
                continue;
            const dungeonEvent = event.data;
            if (dungeonEvent.runId === runId)
                events.push(structuredClone(dungeonEvent));
        }
        return events.sort((left, right) => left.sequence - right.sequence);
    }
    resolveSession(runId, actorSessionId) {
        const cached = this.runSessions.get(runId);
        if (cached)
            return cached;
        if (actorSessionId) {
            const actorSession = this.sessions.get(actorSessionId);
            if (actorSession)
                return actorSession;
        }
        return this.sessions.list().find((session) => session.events.some((event) => event.type === 'dungeon/event' && event.data.runId === runId));
    }
}
