import { defineConfig } from "@playwright/test";
import packagedChromium from "@sparticuz/chromium";
const packaged = process.platform === "linux" && process.arch === "x64";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5179",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_EXECUTABLE_PATH ||
        (packaged ? await packagedChromium.executablePath() : undefined),
      args: packaged
        ? packagedChromium.args.filter((a) => a !== "--single-process")
        : [],
    },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5179 --strictPort",
    url: "http://127.0.0.1:5179",
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: "list",
});
