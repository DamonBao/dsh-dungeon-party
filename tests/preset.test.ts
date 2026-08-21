import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'

const presetRoot = new URL('../preset/dungeon-party/', import.meta.url)

describe('dungeon-party agent preset', () => {
  it('declares discoverable metadata and an isolated dungeon service', async () => {
    const metadata = load(await readFile(new URL('preset.yml', presetRoot), 'utf8')) as Record<string, unknown>
    const composition = load(await readFile(new URL('agent.cordis.yml', presetRoot), 'utf8')) as Array<Record<string, unknown>>

    expect(metadata).toMatchObject({ name: '五人本模式', order: 50 })
    const group = composition.find((row) => row.id === 'dungeon-party-runtime')
    expect(group).toMatchObject({ name: 'cordis:group', group: true, isolate: { dungeonParty: true } })
    expect(group?.config).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dungeon-party', name: '@jcy2387/dsh-dungeon-party/runtime' }),
    ]))
  })

  it('uses the current DSH tool schemas for search and subagents', async () => {
    const composition = load(await readFile(new URL('agent.cordis.yml', presetRoot), 'utf8')) as Array<Record<string, unknown>>
    expect(composition.find((row) => row.id === 'tool-fs-search')).toMatchObject({
      config: { sampleOverCapGlobResults: false },
    })
    expect(composition.find((row) => row.id === 'tool-subagent')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-subagent',
      config: { provider: 'spawn', toolName: 'subagent', backgroundMode: 'continuable' },
    })
    expect(composition.find((row) => row.id === 'tool-subagent-fork')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-subagent',
      config: { provider: 'fork', toolName: 'subagent_fork', backgroundMode: 'continuable' },
    })
  })

  it('mounts the standard rc8 compaction command and bounded tool-result pruner', async () => {
    const composition = load(await readFile(new URL('agent.cordis.yml', presetRoot), 'utf8')) as Array<Record<string, unknown>>
    const group = composition.find((row) => row.id === 'compaction')
    expect(group).toMatchObject({
      name: 'cordis:group',
      group: true,
      isolate: { compaction: true, toolResultPruner: true },
    })
    expect(group?.config).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '@deepseek-ai/dsh-compaction-basic' }),
      expect.objectContaining({ name: '@deepseek-ai/dsh-command-compact' }),
      expect.objectContaining({
        name: '@deepseek-ai/dsh-compaction-tool-result-pruner',
        config: expect.objectContaining({ thresholdChars: 8192 }),
      }),
    ]))
  })

  it('publishes the optional Web client overlay entry', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', presetRoot), 'utf8')) as {
      exports: Record<string, unknown>
      dsh: { client?: { platform?: string; inject?: string[] } }
    }
    expect(pkg.exports).toHaveProperty('./client')
    expect(pkg.dsh.client).toMatchObject({
      platform: 'web',
      inject: expect.arrayContaining(['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-layout']),
    })
  })
})
