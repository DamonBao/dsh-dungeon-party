/**
 * Event names persisted by this plugin.
 *
 * rc8 exports its generated vocabulary as ReadonlySet but does not yet expose
 * a downstream registration API or an `ignorable` append option. Registering
 * before Session persistence reads is therefore the only rc8-compatible way
 * to keep plugin-owned logs readable after restart.
 */
export declare const DUNGEON_SESSION_EVENT_TYPES: readonly ["dungeon/event", "dungeon/projection"];
export declare function registerDungeonSessionEventTypes(): void;
