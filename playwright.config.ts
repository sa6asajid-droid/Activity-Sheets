import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3200);
const DATA = process.env.E2E_DATA_DIR || "/tmp/curiosity-studio-e2e";

/**
 * End-to-end tests run against a production build (`npm run build` first)
 * with the clearly labelled mock provider, a throwaway data directory and no
 * network access to any AI service.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { actionTimeout: 30_000, baseURL: `http://localhost:${PORT}`, viewport: { width: 1500, height: 1000 }, acceptDownloads: true },
  webServer: {
    command: `rm -rf ${DATA} && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { CS_TEXT_PROVIDER: "mock", CS_SEARCH_PROVIDER: "mock", CS_DATA_DIR: DATA, ANTHROPIC_API_KEY: "" },
  },
});
