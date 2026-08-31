import { readFileSync } from 'node:fs'
import { defineConfig, type UserConfig } from 'tsdown'

const pluginId: string = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).name

// Emits only the client type declarations. The runtime browser bundle is
// produced by tsdown.config.ts with the module-loader banner; emitting a
// second index.js here would ship a dead, un-exported duplicate.
const config: UserConfig = {
  name: `${pluginId}/client-types`,
  entry: { index: 'client/index.tsx' },
  outDir: 'lib/client',
  format: 'esm',
  platform: 'browser',
  dts: { emitDtsOnly: true },
  sourcemap: false,
  clean: false,
  external: [
    'react',
    'react/jsx-runtime',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-slots',
    'node:fs',
    'node:path',
  ],
}

export default defineConfig(config)
