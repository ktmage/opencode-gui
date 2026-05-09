import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    root: "webview",
    setupFiles: [path.resolve(__dirname, "webview/__tests__/setup.ts")],
    include: ["./__tests__/**/*.test.{ts,tsx}"],
    globals: true,
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
