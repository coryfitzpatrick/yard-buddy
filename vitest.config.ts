import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.worktrees/**"],
    env: {
      RESEND_API_KEY: "test",
      AUTH_SECRET: "test-secret-for-vitest",
    },
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/__tests__/**",
        // Integration-layer files (external services, no unit-testable logic)
        "lib/auth.ts",
        "lib/claude.ts",
        "lib/db.ts",
        "lib/email.ts",
        "lib/supabase-client.ts",
        "lib/supabase-server.ts",
        "lib/utils.ts",
        "lib/weather.ts",
        "lib/cron/overdue-assessor.ts",
        "lib/validations/auth.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
