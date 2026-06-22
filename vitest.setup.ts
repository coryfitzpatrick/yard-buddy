import { vi } from "vitest";

// Global stub for @axiomhq/nextjs. The package's ESM bundle imports
// "next/server" without a .js extension, which Vitest's strict ESM resolver
// rejects. Next's bundler handles it fine in production builds — this stub
// only affects the test runner. createAxiomRouteHandler becomes an identity
// wrapper, nextJsFormatters becomes an empty array. Both are no-ops for
// tests that don't exercise route-handler behavior.
vi.mock("@axiomhq/nextjs", () => ({
  createAxiomRouteHandler: <T>(_logger: unknown, _opts?: unknown) => (handler: T) => handler,
  nextJsFormatters: [],
}));

// Global stub for next/server's `after()`. The real implementation requires a
// live Next.js request scope, which doesn't exist in vitest's node environment.
// We invoke the callback immediately and swallow any rejection so background
// work scheduled via after() runs inline during tests without crashing the
// request. NextRequest/NextResponse are preserved from the real module.
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (cb: () => unknown | Promise<unknown>) => {
      try {
        const result = cb();
        if (result && typeof (result as Promise<unknown>).catch === "function") {
          (result as Promise<unknown>).catch(() => {});
        }
      } catch {
        // swallow — after() is fire-and-forget in production
      }
    },
  };
});
