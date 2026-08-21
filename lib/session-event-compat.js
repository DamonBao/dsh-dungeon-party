import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session';
/**
 * Event names persisted by this plugin.
 *
 * rc8 exports its generated vocabulary as ReadonlySet but does not yet expose
 * a downstream registration API or an `ignorable` append option. Registering
 * before Session persistence reads is therefore the only rc8-compatible way
 * to keep plugin-owned logs readable after restart.
 */
export const DUNGEON_SESSION_EVENT_TYPES = [
    'dungeon/event',
    'dungeon/projection',
];
export function registerDungeonSessionEventTypes() {
    const vocabulary = KNOWN_SESSION_EVENT_TYPES;
    for (const type of DUNGEON_SESSION_EVENT_TYPES)
        vocabulary.add(type);
}
