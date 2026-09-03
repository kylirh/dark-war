import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.ts",
      "server/**/*.test.ts",
      // Pure, dependency-free helpers shared with the Electron main process.
      "electron/**/*.test.ts",
    ],
    // Keep the heavy Electron/Pixi/DOM modules out — these are unit tests for
    // the deterministic game logic, not the rendering or windowing layers.
    exclude: ["node_modules/**", "app/**", "dist/**"],
  },
});
