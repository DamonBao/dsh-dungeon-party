import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)

describe('DSH 0.1.2-rc.1 client bundle', () => {
  it('publishes the module-loader closure artifact expected by dsh web', async () => {
    const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8')) as {
      name: string
      exports: Record<string, { default?: string } | string>
      peerDependencies: Record<string, string>
    }
    expect(pkg.name).toBe('@jcy2387/dsh-dungeon-party')
    // The rc-era `dsh-client-runtime` package was retired in 0.1.2-alpha;
    // the client surface now comes from the Session Controller adapter.
    expect(pkg.peerDependencies['@deepseek-ai/dsh-client-runtime']).toBeUndefined()
    expect(pkg.peerDependencies['@deepseek-ai/dsh-api-session-controller']).toBe('>=0.1.2-rc.1 <0.2.0')
    expect((pkg.exports['./client'] as { default?: string })?.default).toBe('./lib/client.js')
    expect((pkg.exports['.'] as { default?: string })?.default).toBe('./lib/preset-sync.js')
    expect((pkg.exports['./runtime'] as { default?: string })?.default).toBe('./lib/index.js')
    expect(pkg.exports['./package.json']).toBe('./package.json')

    const hostPatch = await readFile(new URL('cordis.patch.yml', root), 'utf8')
    expect(hostPatch).toContain("name: '@jcy2387/dsh-dungeon-party'")
    expect(hostPatch).not.toContain('@jcy2387/dsh-dungeon-party/preset-sync')
    const preset = await readFile(new URL('preset/dungeon-party/agent.cordis.yml', root), 'utf8')
    expect(preset).toContain("name: '@jcy2387/dsh-dungeon-party/runtime'")

    const bundle = await readFile(new URL('lib/client.js', root), 'utf8')
    expect(bundle).toContain('window.__ModuleLoader__.load')
    expect(bundle).toContain('id: "@jcy2387/dsh-dungeon-party"')
  })
})
