import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', timeout: 45000, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5175', channel: 'msedge', headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
    { name: 'chrome-desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 1000 } } },
  ],
  // Use the built application: source edits cannot reset an iframe mid-test via HMR.
  webServer: { command: 'npm run build && npm run preview -- --port 5175 --strictPort', url: 'http://127.0.0.1:5175', reuseExistingServer: false, env: { VITE_TMDB_API_KEY: 'e2e-local-only' } },
})
