import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'wails-go.spec.ts', fullyParallel: false,
  workers: 1, retries: 0, timeout: 90000, expect: { timeout: 15000 },
  use: { ...devices['Desktop Chrome'], baseURL: process.env.BASE_URL || 'http://127.0.0.1:3012', locale: 'ko-KR', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: [['list']], outputDir: '../.runtime/wails-e2e/results',
});
