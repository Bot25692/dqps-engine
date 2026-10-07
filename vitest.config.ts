import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * Vitest configuration for A.D.A.P.T.
 * Runs lib/simulation and lib/integration tests.
 * The `@/*` alias mirrors tsconfig.json paths so imports resolve correctly.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/__tests__/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    reporters: ["verbose"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
