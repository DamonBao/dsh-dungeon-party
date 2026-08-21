/** Event names persisted by this plugin. */
export declare const DUNGEON_SESSION_EVENT_TYPES: readonly ["dungeon/event", "dungeon/projection"];
/**
 * Defensive vocabulary registration: existing types are skipped without
 * mutating anything, and a frozen or otherwise read-only vocabulary never
 * throws — the failure degrades to a single warning instead.
 */
export declare function addDungeonTypes(vocabulary: ReadonlySet<string>): void;
/** Register against this package's module instance (direct/runtime mounts). */
export declare function registerDungeonSessionEventTypes(): void;
/**
 * Register against the exact dsh-session instance resolved by the host config.
 * pnpm may install a peer copy below a third-party plugin; mutating only that
 * copy does not affect persistence validation in the DSH host.
 */
export declare function registerHostDungeonSessionEventTypes(baseUrl: URL | string): Promise<void>;
