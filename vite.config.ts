import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig(({ command }) => ({
  // Root index.html (this file) is the Vite dev entry point.
  // app/index.html is the Electron entry point and stays unchanged.
  root: ".",

  // Quieter build output: only warnings/errors (no per-step "transforming…" spam).
  logLevel: "warn",

  // In dev: serve app/ contents at / so asset paths ("assets/...") resolve
  // correctly without any changes to TypeScript or CSS source.
  // In build: false — we don't want Vite copying app/ into app/.
  publicDir: command === "serve" ? "app" : false,

  server: {
    port: 5174,
    open: false, // let the preview tool open it
    // Pre-bundle heavy deps so first HMR round-trips are fast
  },

  optimizeDeps: {
    include: ["pixi.js", "detect-collisions", "rot-js"],
  },

  esbuild: {
    // Target Chromium/Electron — no unnecessary downlevelling
    target: "es2020",
  },

  build: {
    outDir: "app",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/client/main.ts"),
      name: "DarkWar",
      formats: ["iife"],
      fileName: () => "game.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    sourcemap: true,
    target: "es2020",
    // The game ships as a single IIFE bundle; the >500 kB notice is expected.
    chunkSizeWarningLimit: 2000,
  },

  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
}));
