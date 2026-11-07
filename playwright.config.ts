import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tools/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: {
    command: "node tools/e2e/serve.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
