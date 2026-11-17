import { defineConfig, devices } from '@playwright/test'

const port = process.env.E2E_PORT ?? '3100'
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The app under test is `next dev`, which compiles each route the first
  // time it is opened. With several workers that can take longer than
  // Playwright's default 5 seconds, so allow for it once, here.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The app under test always runs in fake mode: in-memory MongoDB, fake
  // calendar provider, test sign-in. No Google account is ever involved.
  webServer: {
    command: 'pnpm run dev:fake',
    env: { PORT: port },
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
