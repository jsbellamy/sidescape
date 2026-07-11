import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { viewport: { width: 360, height: 900 } },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
