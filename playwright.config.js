import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration
 * E2E smoke tests for mental health resource navigator
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: { mode: 'only-on-failure', fullPage: true },
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
      },
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 13'],
        // Use WebKit browser to match iOS Safari
        browserName: 'webkit',
      },
    },
  ],

  webServer: {
    command: 'npx http-server dist -p 4173 -c-1',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

