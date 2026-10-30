import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration - Frontend UI Test
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test Directory
  testDir: './e2e',

  // Test File Matching Mode
  testMatch: '**/*.spec.ts',

  // Run parallel tests
  fullyParallel: true,

  // CI Failures in the environment stop immediately
  forbidOnly: !!process.env.CI,

  // Failed not to try again
  retries: 0,

  // Parallel worker Number
  workers: process.env.CI ? 1 : undefined,

  // Test report
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ...(process.env.CI ? [['github'] as const] : []),
  ],

  // Global Settings
  use: {
    // Basis URL
    baseURL: process.env.BASE_URL || 'http://localhost:3011',

    // Screenshot Settings
    screenshot: 'only-on-failure',

    // Video Settings
    video: 'retain-on-failure',

    // Tracking Settings
    trace: 'retain-on-failure',

    // Browser Language Settings（E2E Test in Chinese, match selector）
    locale: 'zh-CN',

    // Timeout Settings
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  // Global timeout
  timeout: 60000,

  // Expected timeout
  expect: {
    timeout: 10000,
  },

  // Project Configuration (multi-browser testing)）
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start service on local development
  webServer: process.env.CI ? undefined : {
    command: 'cd .. && docker compose up -d && sleep 10',
    url: 'http://localhost:3011',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
