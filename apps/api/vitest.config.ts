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
      RAZORPAY_KEY_ID:         'rzp_test_key',
      RAZORPAY_KEY_SECRET:     'test_secret_key',
      RAZORPAY_WEBHOOK_SECRET: 'webhook_secret_xyz',
      PHONEPE_SALT_KEY:        'test_salt_key_abc',
      PHONEPE_SALT_INDEX:      '1',
      PHONEPE_MERCHANT_ID:     'TEST_MERCHANT',
      PHONEPE_ENV:             'sandbox',
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
