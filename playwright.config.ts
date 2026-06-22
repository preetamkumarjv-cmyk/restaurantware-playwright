import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:       './tests',
  fullyParallel: false,
  forbidOnly:    false,
  retries:       1,
  workers:       1,
  timeout:       120_000,
  expect:        { timeout: 20_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html-report', open: 'never' }],
  ],

  use: {
    baseURL:           'https://www.restaurantware.com',
    headless:          false,
    viewport:          { width: 1920, height: 1080 },
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    trace:             'retain-on-failure',
    actionTimeout:     30_000,
    navigationTimeout: 60_000,
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        // No channel — use Playwright's built-in Chromium (always installed)
        // No devices spread — avoids deviceScaleFactor conflict
        launchOptions: {
          args: ['--start-maximized'],
        },
      },
    },
  ],

  outputDir: 'test-results',
});
