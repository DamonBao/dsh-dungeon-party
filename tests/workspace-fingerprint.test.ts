import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
