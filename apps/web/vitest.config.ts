import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns tests/e2e; vitest runs unit tests only.
    exclude: ["tests/e2e/**", "**/node_modules/**", "**/.next/**", "**/dist/**"],
  },
});
