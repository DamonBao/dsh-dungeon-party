import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import {
  registerDungeonSessionEventTypes,
  registerHostDungeonSessionEventTypes,
} from './session-event-compat.js'

// Loader module evaluation precedes user-triggered cold history reads.
registerDungeonSessionEventTypes()

/** Stable host plugin name for the preset bootstrap. */
export const name = 'dungeon-party-preset-sync'

const PRESET_ID = 'dungeon-party'

/** Expand a leading ~ using the same DSH_HOME convention as the launcher. */
function expandHome(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return path
}

/** Resolve the Harness home, honoring DSH_HOME when it is set. */
export function resolveDshHome(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const raw = env.DSH_HOME
  if (raw !== undefined && raw.trim() !== '') {
    const expanded = expandHome(raw.trim(), home)
    return isAbsolute(expanded) ? expanded : join(process.cwd(), expanded)
  }
  return join(home, '.dsh')
}

/** Absolute path of the preset bundled with this package. */
export function bundledPresetDirectory(): string {
  return fileURLToPath(new URL('../preset/dungeon-party/', import.meta.url))
}

/**
 * Install the bundled preset into the DSH user roster.
 *
 * The preset roster intentionally lives outside profile node_modules, so a
 * package dependency alone cannot make a preset selectable. This sync is
 * idempotent and owns only the `dungeon-party` directory.
 */
export function syncDungeonPartyPreset(home: string = resolveDshHome()): string {
  const source = bundledPresetDirectory()
  if (!existsSync(source)) throw new Error(`bundled preset directory is missing: ${source}`)

  const targetRoot = join(home, '.agent-presets')
  const target = join(targetRoot, PRESET_ID)
  const temporary = join(targetRoot, `.${PRESET_ID}.tmp-${process.pid}`)

  mkdirSync(targetRoot, { recursive: true })
  rmSync(temporary, { recursive: true, force: true })
  cpSync(source, temporary, { recursive: true })
  rmSync(target, { recursive: true, force: true })
  renameSync(temporary, target)
  return target
}

/** Host-plane bootstrap loaded with the profile bundle. */
export async function apply(ctx: Context): Promise<void> {
  if (!ctx.baseUrl) throw new Error('dungeon-party: host baseUrl is required for Session event compatibility')
  await registerHostDungeonSessionEventTypes(ctx.baseUrl)
  try {
    const target = syncDungeonPartyPreset()
    ctx.logger.info(`dungeon-party: preset synced into ${target}`)
  } catch (error) {
    ctx.logger.warn(`dungeon-party: preset sync failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
