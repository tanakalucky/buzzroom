import { defineConfig } from "@playwright/test";

const hostedURL = process.env.BUZZROOM_E2E_BASE_URL;
if (
  hostedURL &&
  !/^https:\/\/[a-f0-9]{8}-buzzroom\.luckyyeslucky777\.workers\.dev\/$/.test(hostedURL)
) {
  throw new Error("E2E の対象は検証済みの immutable Preview URL に限定します");
}

export default defineConfig({
  testDir: "./tools/e2e",
  globalSetup: hostedURL ? "./tools/e2e/hosted-setup.ts" : undefined,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: hostedURL ?? "http://127.0.0.1:4173",
    browserName: "chromium",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: hostedURL
    ? undefined
    : {
        command: "node tools/e2e/serve.mjs",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: false,
        timeout: 60000,
      },
});
