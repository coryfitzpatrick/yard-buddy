import { describe, it, expect, vi } from "vitest";

// ../claude transitively imports the observability logger (via callClaude),
// which pulls in Axiom's Next.js route-handler wrapper. Stub it so Vitest's
// ESM resolver can load the module under test.
vi.mock("@axiomhq/nextjs", () => ({
  createAxiomRouteHandler: <T,>(_logger: unknown, _opts?: unknown) => (handler: T) => handler,
  nextJsFormatters: [],
}));

const { validateLawnImages } = await import("../claude");

describe("validateLawnImages", () => {
  it("is exported from lib/claude", () => {
    expect(typeof validateLawnImages).toBe("function");
  });
});
