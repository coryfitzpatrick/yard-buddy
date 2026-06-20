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
