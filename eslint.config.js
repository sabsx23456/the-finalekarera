import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // This codebase currently uses `any` in a number of pragmatic places (Supabase payloads, 3rd-party libs).
      // Turning this off keeps `npm run lint` usable without forcing a large refactor.
      '@typescript-eslint/no-explicit-any': 'off',

      // Often false-positive/noise for regex-heavy code and not worth blocking CI/dev.
      'no-useless-escape': 'off',

      // Keep these as warnings for now; they are valuable but currently too noisy as hard errors.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'prefer-const': 'warn',

      // Vite HMR rule is useful but not worth blocking lint for legacy components.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
