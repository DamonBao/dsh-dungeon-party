import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  bundledPresetDirectory,
  resolveDshHome,
  syncDungeonPartyPreset,
} from '../src/preset-sync.js'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('dungeon-party preset bootstrap', () => {
  it('resolves DSH_HOME using the launcher convention', () => {
    expect(resolveDshHome({ DSH_HOME: '~/custom-dsh' }, '/Users/tester'))
      .toBe('/Users/tester/custom-dsh')
    expect(resolveDshHome({ DSH_HOME: 'relative-dsh' }, '/Users/tester'))
      .toBe(join(process.cwd(), 'relative-dsh'))
    expect(resolveDshHome({}, '/Users/tester')).toBe('/Users/tester/.dsh')
  })

  it('syncs the bundled preset into the user roster', () => {
    const root = mkdtempSync(join(tmpdir(), 'dungeon-party-'))
    temporaryRoots.push(root)

    const target = syncDungeonPartyPreset(root)
    expect(target).toBe(join(root, '.agent-presets', 'dungeon-party'))
    expect(readFileSync(join(target, 'agent.cordis.yml'), 'utf8'))
      .toBe(readFileSync(join(bundledPresetDirectory(), 'agent.cordis.yml'), 'utf8'))
    expect(readFileSync(join(target, 'preset.yml'), 'utf8'))
      .toBe(readFileSync(join(bundledPresetDirectory(), 'preset.yml'), 'utf8'))
  })
})
