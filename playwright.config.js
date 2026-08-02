import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration
 * E2E smoke tests for mental health resource navigator
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // CI ran everything on a single worker, leaving most of the runner idle.
  // '50%' scales with whatever the runner provides rather than hardcoding a
  // core count, and stays conservative because the visual snapshot tests in
  // mobile.spec are timing-sensitive under load. retries above absorbs the
  // occasional flake; raise this further only if runs stay stable.
  workers: process.env.CI ? '50%' : undefined,
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
      // Android / Chrome. devices['iPhone 13'] defaults to WebKit, so this
      // project previously ran the exact same browser as mobile-webkit below:
      // every mobile test executed twice on WebKit and Android was never
      // covered at all. Pixel 7 is Chromium, which is what Android users get.
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
      },
    },
    {
      // iOS / Safari. browserName is redundant with the device default but is
      // kept explicit so this project cannot silently change browser again.
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 13'],
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

