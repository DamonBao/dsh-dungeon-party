import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)

describe('DSH rc8 client bundle', () => {
  it('publishes the module-loader closure artifact expected by dsh web', async () => {
    const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8')) as {
      exports: Record<string, { default?: string } | string>
    }
    expect((pkg.exports['./client'] as { default?: string })?.default).toBe('./lib/client.js')
    expect((pkg.exports['.'] as { default?: string })?.default).toBe('./lib/preset-sync.js')
    expect((pkg.exports['./runtime'] as { default?: string })?.default).toBe('./lib/index.js')
    expect(pkg.exports['./package.json']).toBe('./package.json')

    const hostPatch = await readFile(new URL('cordis.patch.yml', root), 'utf8')
    expect(hostPatch).toContain('name: dsh-dungeon-party')
    expect(hostPatch).not.toContain('dsh-dungeon-party/preset-sync')
    const preset = await readFile(new URL('preset/dungeon-party/agent.cordis.yml', root), 'utf8')
    expect(preset).toContain('name: dsh-dungeon-party/runtime')

    const bundle = await readFile(new URL('lib/client.js', root), 'utf8')
    expect(bundle).toContain('window.__ModuleLoader__.load')
    expect(bundle).toContain('id: "dsh-dungeon-party"')
  })
})
