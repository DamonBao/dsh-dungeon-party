import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)

describe('DSH rc8 client bundle', () => {
  it('publishes the module-loader closure artifact expected by dsh web', async () => {
    const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8')) as {
      exports: Record<string, { default?: string }>
    }
    expect(pkg.exports['./client']?.default).toBe('./lib/client.js')

    const bundle = await readFile(new URL('lib/client.js', root), 'utf8')
    expect(bundle).toContain('window.__ModuleLoader__.load')
    expect(bundle).toContain('id: "dsh-dungeon-party"')
  })
})
