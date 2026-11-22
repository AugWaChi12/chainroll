// @ts-check
import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/storybook-static/**',
      '**/dist/**',
      '**/next-env.d.ts',
      'packages/contracts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },

  // ── Architecture boundaries (docs/PROJECT_BRIEF.md §10.2) ──
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['apps/web/src/**/*'],
      'import/resolver': { typescript: { project: 'apps/web/tsconfig.json' } },
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/web/src/app' },
        { type: 'feature', pattern: 'apps/web/src/features/*', capture: ['feature'] },
        { type: 'server', pattern: 'apps/web/src/server' },
        { type: 'lib', pattern: 'apps/web/src/lib' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            // anything may import inside its own element
            { allow: { dependency: { relationship: { to: 'internal' } } } },
            {
              from: { element: { type: 'app' } },
              allow: { to: { element: { types: ['server', 'lib'] } } },
            },
            // features/Y only through its public index.ts
            {
              from: { element: { types: ['app', 'feature'] } },
              allow: {
                to: { element: { type: 'feature', internalPath: ['index.ts', 'index.tsx'] } },
              },
            },
            {
              from: { element: { type: 'feature' } },
              allow: { to: { element: { types: ['server', 'lib'] } } },
            },
            {
              from: { element: { type: 'server' } },
              allow: { to: { element: { types: ['server', 'lib'] } } },
            },
            { from: { element: { type: 'lib' } }, allow: { to: { element: { type: 'lib' } } } },
          ],
        },
      ],
    },
  },
  // packages/ui must stay domain-free
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@deekub/web', '**/apps/**'], message: 'ui must not depend on apps' },
          ],
        },
      ],
    },
  },
)
