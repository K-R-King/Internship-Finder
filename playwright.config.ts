import { defineConfig } from "@playwright/test";

// PORT runs the tests on another port, e.g. when something else is using 3005
const port = Number(process.env.PORT ?? 3005);

// Browser tests (accessibility checks). Locally they reuse a running dev server and your installed Chrome;
// in CI they run against the production build (npm run build first).
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    channel: process.env.CI ? undefined : "chrome",
  },
  webServer: {
    command: process.env.CI ? `npx next start -p ${port}` : `npx next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
