import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session';
/** Event names persisted by this plugin. */
export const DUNGEON_SESSION_EVENT_TYPES = [
    'dungeon/event',
    'dungeon/projection',
];
let warnedReadOnlyVocabulary = false;
function warnReadOnlyVocabulary(error) {
    if (warnedReadOnlyVocabulary)
        return;
    warnedReadOnlyVocabulary = true;
    console.warn(`[dsh-dungeon-party] Could not register dungeon session event types (${DUNGEON_SESSION_EVENT_TYPES.join(', ')}) with a read-only host vocabulary; the host may reject dungeon event persistence.`, error);
}
/**
 * Defensive vocabulary registration: existing types are skipped without
 * mutating anything, and a frozen or otherwise read-only vocabulary never
 * throws — the failure degrades to a single warning instead.
 */
export function addDungeonTypes(vocabulary) {
    for (const type of DUNGEON_SESSION_EVENT_TYPES) {
        if (vocabulary.has(type))
            continue;
        try {
            ;
            vocabulary.add(type);
        }
        catch (error) {
            warnReadOnlyVocabulary(error);
        }
    }
}
/** Register against this package's module instance (direct/runtime mounts). */
export function registerDungeonSessionEventTypes() {
    addDungeonTypes(KNOWN_SESSION_EVENT_TYPES);
}
/**
 * Register against the exact dsh-session instance resolved by the host config.
 * pnpm may install a peer copy below a third-party plugin; mutating only that
 * copy does not affect persistence validation in the DSH host.
 */
export async function registerHostDungeonSessionEventTypes(baseUrl) {
    const hostRequire = createRequire(baseUrl);
    const entry = hostRequire.resolve('@deepseek-ai/dsh-session');
    const hostSession = await import(pathToFileURL(entry).href);
    addDungeonTypes(hostSession.KNOWN_SESSION_EVENT_TYPES);
}
