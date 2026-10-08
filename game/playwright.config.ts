import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "chase*.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5175", launchOptions: {args: process.platform === 'win32' ? ['--use-angle=d3d11','--force-high-performance-gpu','--force_high_performance_gpu'] : []} },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:5175",
    env: { PORT: "5175" },
    reuseExistingServer: false,
  },
  reporter: "list",
});
