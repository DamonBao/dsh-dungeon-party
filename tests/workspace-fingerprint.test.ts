import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  computeWorkspaceFingerprint,
  createWorkspaceSnapshot,
  diffWorkspaceSnapshots,
} from '../src/adapters/workspace-fingerprint.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('workspace fingerprint', () => {
  it('is deterministic, content-sensitive, and respects normalized ignore scopes', () => {
    const root = mkdtempSync(join(tmpdir(), 'dungeon-fingerprint-'))
    roots.push(root)
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 'coverage'))
    writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 1\n')
    writeFileSync(join(root, 'coverage', 'result.json'), '{"covered":1}\n')

    const baseline = createWorkspaceSnapshot(root, ['coverage/**'])
    const first = computeWorkspaceFingerprint(root, ['coverage/**'])
    expect(computeWorkspaceFingerprint(root, ['coverage/**'])).toBe(first)

    writeFileSync(join(root, 'coverage', 'result.json'), '{"covered":0}\n')
    expect(computeWorkspaceFingerprint(root, ['coverage/**'])).toBe(first)

    writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 2\n')
    expect(computeWorkspaceFingerprint(root, ['coverage/**'])).not.toBe(first)
    expect(diffWorkspaceSnapshots(baseline, createWorkspaceSnapshot(root, ['coverage/**']))).toEqual(['src/index.ts'])
  })

  it('rejects ignore scopes that escape the workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'dungeon-fingerprint-'))
    roots.push(root)
    expect(() => computeWorkspaceFingerprint(root, ['../secret/**'])).toThrowError(
      expect.objectContaining({ code: 'INVALID_SCOPE' }),
    )
  })

  it('ignores hidden directories beneath an ignore scope (glob ** does not cross dot dirs)', () => {
    const root = mkdtempSync(join(tmpdir(), 'dungeon-fingerprint-'))
    roots.push(root)
    mkdirSync(join(root, 'node_modules', '.vite', 'vitest', 'hash'), { recursive: true })
    mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
    mkdirSync(join(root, '.git'), { recursive: true })
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'node_modules', '.vite', 'vitest', 'hash', 'results.json'), '{"r":1}\n')
    writeFileSync(join(root, 'node_modules', '.bin', 'tool'), '#!/bin/sh\n')
    writeFileSync(join(root, '.git', 'index'), 'binary-ish\n')
    writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 1\n')

    const scopes = ['node_modules/**', '.git/**']
    const baseline = createWorkspaceSnapshot(root, scopes)
    expect(Object.keys(baseline)).toEqual(['src/index.ts'])

    // Changes inside ignored hidden directories never surface in diffs.
    writeFileSync(join(root, 'node_modules', '.vite', 'vitest', 'hash', 'results.json'), '{"r":2}\n')
    writeFileSync(join(root, '.git', 'index'), 'changed\n')
    expect(diffWorkspaceSnapshots(baseline, createWorkspaceSnapshot(root, scopes))).toEqual([])
  })
})

describe('workspace fingerprint git head', () => {
  const FIRST_COMMIT = '1111111111111111111111111111111111111111'
  const SECOND_COMMIT = '2222222222222222222222222222222222222222'

  /**
   * The pre-git file-tree-only digest, recomputed independently here so the
   * tests can prove byte-exact compatibility with the legacy fingerprint.
   */
  function fileTreeOnlyFingerprint(root: string, ignoreScopes: string[] = []): string {
    const snapshot = createWorkspaceSnapshot(root, ignoreScopes)
    const digest = createHash('sha256')
    for (const path of Object.keys(snapshot).sort()) {
      digest.update(path)
      digest.update('\0')
      digest.update(snapshot[path]!)
      digest.update('\0')
    }
    return `sha256:${digest.digest('hex')}`
  }

  function makeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'dungeon-fingerprint-git-'))
    roots.push(root)
    return root
  }

  function writeProject(root: string): void {
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 1\n')
    writeFileSync(join(root, 'README.md'), '# project\n')
  }

  function writePlainRepo(root: string, commit: string, ref = 'refs/heads/main'): void {
    const refPath = join(root, '.git', ...ref.split('/'))
    mkdirSync(dirname(refPath), { recursive: true })
    writeFileSync(join(root, '.git', 'HEAD'), `ref: ${ref}\n`)
    writeFileSync(refPath, `${commit}\n`)
  }

  it('differs when the identical file tree sits on different commits', () => {
    const root = makeRoot()
    writeProject(root)
    writePlainRepo(root, FIRST_COMMIT)

    const atFirst = computeWorkspaceFingerprint(root, ['.git/**'])
    expect(atFirst).not.toBe(fileTreeOnlyFingerprint(root, ['.git/**']))
    // The git entry is deliberately outside the lease-audit snapshot.
    expect(Object.keys(createWorkspaceSnapshot(root, ['.git/**']))).toEqual(['README.md', 'src/index.ts'])

    // Same file tree, same branch, different commit: fingerprint changes.
    writeFileSync(join(root, '.git', 'refs', 'heads', 'main'), `${SECOND_COMMIT}\n`)
    const atSecond = computeWorkspaceFingerprint(root, ['.git/**'])
    expect(atSecond).not.toBe(atFirst)
    expect(atSecond).not.toBe(fileTreeOnlyFingerprint(root, ['.git/**']))

    // Restoring the commit restores the fingerprint: no hidden state.
    writeFileSync(join(root, '.git', 'refs', 'heads', 'main'), `${FIRST_COMMIT}\n`)
    expect(computeWorkspaceFingerprint(root, ['.git/**'])).toBe(atFirst)
  })

  it('mixes in detached HEAD commit ids and packed refs', () => {
    const detached = makeRoot()
    writeProject(detached)
    mkdirSync(join(detached, '.git'))
    writeFileSync(join(detached, '.git', 'HEAD'), `${FIRST_COMMIT}\n`)
    const detachedFirst = computeWorkspaceFingerprint(detached, ['.git/**'])
    expect(detachedFirst).not.toBe(fileTreeOnlyFingerprint(detached, ['.git/**']))
    writeFileSync(join(detached, '.git', 'HEAD'), `${SECOND_COMMIT}\n`)
    expect(computeWorkspaceFingerprint(detached, ['.git/**'])).not.toBe(detachedFirst)

    // A gc-packed branch tip resolves through packed-refs, including the
    // comment header and peeled tag lines that must be skipped.
    const packed = makeRoot()
    writeProject(packed)
    mkdirSync(join(packed, '.git'))
    writeFileSync(join(packed, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(packed, '.git', 'packed-refs'), [
      '# pack-refs with: peeled fully-peeled sorted ',
      `${FIRST_COMMIT} refs/heads/main`,
      `^${SECOND_COMMIT}`,
      `${SECOND_COMMIT} refs/tags/v1`,
    ].join('\n'))
    const packedFirst = computeWorkspaceFingerprint(packed, ['.git/**'])
    expect(packedFirst).not.toBe(fileTreeOnlyFingerprint(packed, ['.git/**']))
    writeFileSync(join(packed, '.git', 'packed-refs'), `${SECOND_COMMIT} refs/heads/main\n`)
    expect(computeWorkspaceFingerprint(packed, ['.git/**'])).not.toBe(packedFirst)
  })

  it('follows a linked-worktree .git pointer file', () => {
    const root = makeRoot()
    writeProject(root)
    const gitDir = mkdtempSync(join(tmpdir(), 'dungeon-fingerprint-gitdir-'))
    roots.push(gitDir)
    mkdirSync(join(gitDir, 'refs', 'heads'), { recursive: true })
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(gitDir, 'refs', 'heads', 'main'), `${FIRST_COMMIT}\n`)
    writeFileSync(join(root, '.git'), `gitdir: ${gitDir}\n`)

    const atFirst = computeWorkspaceFingerprint(root, ['.git/**'])
    expect(atFirst).not.toBe(fileTreeOnlyFingerprint(root, ['.git/**']))

    // Moving only the external worktree HEAD changes the fingerprint.
    writeFileSync(join(gitDir, 'refs', 'heads', 'main'), `${SECOND_COMMIT}\n`)
    expect(computeWorkspaceFingerprint(root, ['.git/**'])).not.toBe(atFirst)
  })

  it('keeps the legacy fingerprint when git state is absent or broken', () => {
    // No .git at all: byte-identical to the pre-git algorithm.
    const plain = makeRoot()
    writeProject(plain)
    expect(computeWorkspaceFingerprint(plain, ['.git/**'])).toBe(fileTreeOnlyFingerprint(plain, ['.git/**']))
    expect(computeWorkspaceFingerprint(plain)).toBe(fileTreeOnlyFingerprint(plain))

    // .git exists but HEAD points at a ref that was never created.
    const unborn = makeRoot()
    writeProject(unborn)
    mkdirSync(join(unborn, '.git'))
    writeFileSync(join(unborn, '.git', 'HEAD'), 'ref: refs/heads/missing\n')
    expect(computeWorkspaceFingerprint(unborn, ['.git/**'])).toBe(fileTreeOnlyFingerprint(unborn, ['.git/**']))

    // .git directory exists but contains no HEAD file at all.
    const headless = makeRoot()
    writeProject(headless)
    mkdirSync(join(headless, '.git'))
    expect(computeWorkspaceFingerprint(headless, ['.git/**'])).toBe(fileTreeOnlyFingerprint(headless, ['.git/**']))

    // HEAD content is neither a symbolic ref nor a commit id.
    const garbage = makeRoot()
    writeProject(garbage)
    mkdirSync(join(garbage, '.git'))
    writeFileSync(join(garbage, '.git', 'HEAD'), 'not a ref or commit\n')
    expect(computeWorkspaceFingerprint(garbage, ['.git/**'])).toBe(fileTreeOnlyFingerprint(garbage, ['.git/**']))

    // A loose ref file exists but holds garbage instead of a commit id.
    const badRef = makeRoot()
    writeProject(badRef)
    writePlainRepo(badRef, FIRST_COMMIT)
    writeFileSync(join(badRef, '.git', 'refs', 'heads', 'main'), 'garbage\n')
    expect(computeWorkspaceFingerprint(badRef, ['.git/**'])).toBe(fileTreeOnlyFingerprint(badRef, ['.git/**']))

    // Worktree pointer file whose gitdir target does not exist.
    const brokenPointer = makeRoot()
    writeProject(brokenPointer)
    writeFileSync(join(brokenPointer, '.git'), 'gitdir: /nonexistent/gitdir\n')
    expect(() => computeWorkspaceFingerprint(brokenPointer, ['.git/**'])).not.toThrow()
    expect(computeWorkspaceFingerprint(brokenPointer, ['.git/**'])).toBe(fileTreeOnlyFingerprint(brokenPointer, ['.git/**']))
  })

  it('maps identical repository states to the same fingerprint regardless of location', () => {
    const left = makeRoot()
    const right = makeRoot()
    for (const root of [left, right]) {
      writeProject(root)
      writePlainRepo(root, FIRST_COMMIT)
    }
    const leftFingerprint = computeWorkspaceFingerprint(left, ['.git/**'])
    expect(computeWorkspaceFingerprint(left, ['.git/**'])).toBe(leftFingerprint)
    expect(computeWorkspaceFingerprint(right, ['.git/**'])).toBe(leftFingerprint)
  })
})
