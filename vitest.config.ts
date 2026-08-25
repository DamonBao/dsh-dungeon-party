import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'client/**/*.tsx'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 88,
        branches: 75,
        functions: 84,
        lines: 88,
      },
    },
  },
})
