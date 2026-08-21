import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { join, matchesGlob, relative, resolve, sep } from 'node:path'
import { DungeonError } from '../service/dungeon-service.js'

export type WorkspaceSnapshot = Record<string, string>

/** Git object ids are 40 hex chars (SHA-1) or 64 hex chars (SHA-256). */
const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

function isCommitId(value: string): boolean {
  return COMMIT_ID.test(value)
}

function normalizeScope(scope: string): string {
  const normalized = scope.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
  if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
    throw new DungeonError('INVALID_SCOPE', `Unsafe fingerprint ignore scope: ${scope}`)
  }
  return normalized
}

function isIgnored(path: string, scopes: string[]): boolean {
  return scopes.some((scope) => {
    // Directory excludes use literal prefix matching so hidden children
    // (node_modules/.vite, node_modules/.bin, …) are covered — path.glob's
    // `**` does not cross dot-directories.
    if (scope.endsWith('/**')) {
      const prefix = scope.slice(0, -3)
      if (path === prefix || path.startsWith(`${prefix}/`)) return true
    }
    return matchesGlob(path, scope)
  })
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

/** Best-effort read of a loose ref file that must contain exactly a commit id. */
function readLooseRef(refPath: string): string | undefined {
  try {
    const value = readFileSync(refPath, 'utf8').trim()
    return isCommitId(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** Best-effort lookup of a branch tip that git may have packed via `git gc`. */
function readPackedRef(gitDir: string, refName: string): string | undefined {
  try {
    for (const line of readFileSync(join(gitDir, 'packed-refs'), 'utf8').split('\n')) {
      const trimmed = line.trim()
      // Peeled tag lines (^…) and comments carry no branch tip.
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('^')) continue
      const [commit, name] = trimmed.split(' ')
      if (commit !== undefined && name === refName && isCommitId(commit)) return commit
    }
  } catch {
    // packed-refs is optional; its absence is not an error.
  }
  return undefined
}

function resolveHeadCommit(gitDir: string): string | undefined {
  const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
  if (!head) return undefined
  if (!head.startsWith('ref:')) return isCommitId(head) ? head : undefined
  const refName = head.slice(4).trim()
  // Ref path segments are validated so a corrupt HEAD cannot escape gitDir.
  const segments = refName.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return undefined
  return readLooseRef(join(gitDir, ...segments)) ?? readPackedRef(gitDir, refName)
}

/**
 * Best-effort resolution of the workspace's Git HEAD commit using node:fs
 * only (never shells out to git). Handles plain repositories (.git
 * directory) and linked worktrees (.git pointer file). Any missing or
 * malformed git state degrades to undefined so the fingerprint falls back
 * to the file-tree-only digest.
 */
function resolveGitHeadCommit(workspaceRoot: string): string | undefined {
  try {
    const dotGit = join(workspaceRoot, '.git')
    if (!existsSync(dotGit)) return undefined
    const stat = lstatSync(dotGit)
    if (stat.isFile()) {
      // Linked worktree: .git is a "gitdir: <path>" pointer file.
      const pointer = readFileSync(dotGit, 'utf8').trim()
      if (!pointer.startsWith('gitdir:')) return undefined
      const gitDir = pointer.slice('gitdir:'.length).trim()
      if (!gitDir) return undefined
      return resolveHeadCommit(resolve(workspaceRoot, gitDir))
    }
    if (!stat.isDirectory()) return undefined
    return resolveHeadCommit(dotGit)
  } catch {
    return undefined
  }
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
  const headCommit = resolveGitHeadCommit(workspaceRoot)
  if (headCommit !== undefined) {
    // Repository state is part of the fingerprint (PRD §14.1). The entry
    // always lands at a fixed position with the same separators, and its
    // bare commit id cannot collide with the file:/symlink: entry values.
    digest.update('git:HEAD')
    digest.update('\0')
    digest.update(headCommit)
    digest.update('\0')
  }
  return `sha256:${digest.digest('hex')}`
}
