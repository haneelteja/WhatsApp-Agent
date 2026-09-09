import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    include:     ['src/__tests__/**/*.test.ts'],
    // Env vars set here are available before any module-level constant evaluation.
    // Do NOT rely on process.env assignments inside test files for ESM modules —
    // imports are hoisted and constants are read before top-level test code runs.
    env: {
      API_BASE_URL:            'https://test-api.alphabot.app',
      WEB_BASE_URL:            'https://test.alphabot.app',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include:  ['src/services/**', 'src/routes/**'],
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
});
