import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { join, matchesGlob, relative, resolve, sep } from 'node:path'
import { DungeonError } from '../service/dungeon-service.js'

export type WorkspaceSnapshot = Record<string, string>

function normalizeScope(scope: string): string {
  const normalized = scope.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
  if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
    throw new DungeonError('INVALID_SCOPE', `Unsafe fingerprint ignore scope: ${scope}`)
  }
  return normalized
}

function isIgnored(path: string, scopes: string[]): boolean {
  return scopes.some((scope) => path === scope || matchesGlob(path, scope))
}

/** Capture file and symlink content digests without following workspace symlinks. */
export function createWorkspaceSnapshot(workspaceRoot: string, ignoreScopes: string[] = []): WorkspaceSnapshot {
  const root = realpathSync(resolve(workspaceRoot))
  const scopes = ignoreScopes.map(normalizeScope)
  const snapshot: WorkspaceSnapshot = {}
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolutePath = join(directory, name)
      const workspacePath = relative(root, absolutePath).split(sep).join('/')
      if (isIgnored(workspacePath, scopes)) continue
      const stat = lstatSync(absolutePath)
      if (stat.isSymbolicLink()) {
        snapshot[workspacePath] = `symlink:${createHash('sha256').update(readlinkSync(absolutePath)).digest('hex')}`
      } else if (stat.isDirectory()) {
        walk(absolutePath)
      } else if (stat.isFile()) {
        snapshot[workspacePath] = `file:${createHash('sha256').update(readFileSync(absolutePath)).digest('hex')}`
      }
    }
  }
  walk(root)
  return snapshot
}

export function diffWorkspaceSnapshots(before: WorkspaceSnapshot, after: WorkspaceSnapshot): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((path) => before[path] !== after[path])
    .sort()
}

/** Compute a deterministic digest without following workspace symlinks. */
export function computeWorkspaceFingerprint(workspaceRoot: string, ignoreScopes: string[] = []): string {
  const snapshot = createWorkspaceSnapshot(workspaceRoot, ignoreScopes)
  const digest = createHash('sha256')
  for (const path of Object.keys(snapshot).sort()) {
    digest.update(path)
    digest.update('\0')
    digest.update(snapshot[path]!)
    digest.update('\0')
  }
  return `sha256:${digest.digest('hex')}`
}
