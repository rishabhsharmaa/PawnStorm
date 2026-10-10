import { defineConfig, devices } from "@playwright/test";

/**
 * Full-stack e2e: boots the whole monorepo (`pnpm dev` starts Postgres+Redis
 * via docker, then web + game server). First run needs `pnpm setup`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    cwd: "../..",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
