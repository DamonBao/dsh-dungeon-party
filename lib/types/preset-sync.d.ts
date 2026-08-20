import type { Context } from '@deepseek-ai/cordis';
/** Stable host plugin name for the preset bootstrap. */
export declare const name = "dungeon-party-preset-sync";
/** Resolve the Harness home, honoring DSH_HOME when it is set. */
export declare function resolveDshHome(env?: NodeJS.ProcessEnv, home?: string): string;
/** Absolute path of the preset bundled with this package. */
export declare function bundledPresetDirectory(): string;
/**
 * Install the bundled preset into the DSH user roster.
 *
 * The preset roster intentionally lives outside profile node_modules, so a
 * package dependency alone cannot make a preset selectable. This sync is
 * idempotent and owns only the `dungeon-party` directory.
 */
export declare function syncDungeonPartyPreset(home?: string): string;
/** Host-plane bootstrap loaded with the profile bundle. */
export declare function apply(ctx: Context): void;
