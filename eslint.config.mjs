import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: ['out/**', 'release/**', 'coverage/**', 'node_modules/**', 'test-results/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The application loads its data from the main process inside effects.
      // That is the intended data flow here, so the compiler rule that
      // discourages `setState` inside an effect body is not applicable.
      'react-hooks/set-state-in-effect': 'off',
      // The React Compiler performs its own memoization; hand written
      // `useCallback` dependency lists are allowed to differ from the
      // inferred ones.
      'react-hooks/preserve-manual-memoization': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/shared/**/*.ts',
      'tests/**/*.ts',
      'scripts/**/*.mjs'
    ],
    languageOptions: {
      globals: globals.node
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
)
