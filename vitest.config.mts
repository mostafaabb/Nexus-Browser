import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
      '@main': resolve(root, 'src/main'),
      '@preload': resolve(root, 'src/preload'),
      '@renderer': resolve(root, 'src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/security/**/*.test.ts',
      'tests/component/**/*.test.{ts,tsx}'
    ],
    exclude: ['tests/e2e/**', 'node_modules/**', 'out/**', 'release/**'],
    setupFiles: [resolve(root, 'tests/setup/vitest.setup.ts')],
    globals: false,
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/shared/**/*.ts', 'src/main/**/*.ts'],
      exclude: ['src/main/index.ts']
    }
  }
})
