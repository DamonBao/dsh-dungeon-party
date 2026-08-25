import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'lib/**',
      'node_modules/**',
      '.npm-cache/**',
      'artifacts/**',
      'consumer/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The event-sourcing reducer intentionally narrows unknown payloads and
      // uses non-null assertions after reducer invariants; both are reviewed
      // at the boundary rather than flagged per occurrence.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
)
