import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/cloudflare/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/cloudflare/setup.ts"],
    testTimeout: 15000,
  },
});
