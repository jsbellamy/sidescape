import { defineConfig } from "vitest/config";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    // Default environment for core suites (pure TS, no DOM). UI tests opt into
    // happy-dom per-file via a `// @vitest-environment happy-dom` docblock.
    environment: "node",
    // Playwright owns the browser-degraded smoke specs in e2e/; keep Vitest's
    // existing colocated suites from ever collecting that directory.
    include: ["src/**/*.test.ts"],
  },
}));
