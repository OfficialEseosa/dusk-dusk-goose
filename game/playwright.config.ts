import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5175" },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:5175",
    env: { PORT: "5175" },
    reuseExistingServer: false,
  },
  reporter: "list",
});
