import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'

/** Event names persisted by this plugin. */
export const DUNGEON_SESSION_EVENT_TYPES = [
  'dungeon/event',
  'dungeon/projection',
] as const

function addDungeonTypes(vocabulary: ReadonlySet<string>): void {
  const mutable = vocabulary as Set<string>
  for (const type of DUNGEON_SESSION_EVENT_TYPES) mutable.add(type)
}

/** Register against this package's module instance (direct/runtime mounts). */
export function registerDungeonSessionEventTypes(): void {
  addDungeonTypes(KNOWN_SESSION_EVENT_TYPES)
}

/**
 * Register against the exact dsh-session instance resolved by the host config.
 * pnpm may install a peer copy below a third-party plugin; mutating only that
 * copy does not affect persistence validation in the DSH host.
 */
export async function registerHostDungeonSessionEventTypes(baseUrl: URL | string): Promise<void> {
  const hostRequire = createRequire(baseUrl)
  const entry = hostRequire.resolve('@deepseek-ai/dsh-session')
  const hostSession = await import(pathToFileURL(entry).href) as {
    KNOWN_SESSION_EVENT_TYPES: ReadonlySet<string>
  }
  addDungeonTypes(hostSession.KNOWN_SESSION_EVENT_TYPES)
}
