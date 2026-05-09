import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared/index.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["extension/__tests__/**/*.test.ts"],
    setupFiles: ["extension/__tests__/setup.ts"],
  },
});
