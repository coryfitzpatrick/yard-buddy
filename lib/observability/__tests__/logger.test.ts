// lib/observability/__tests__/logger.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock @axiomhq/nextjs: its ESM build does `import * as next from "next/server"`
// (no .js extension), which Node's strict ESM resolver rejects under Vitest.
// We only use `createAxiomRouteHandler` and `nextJsFormatters` in logger.ts;
// stub both so the module loads. The Next.js runtime resolves it natively
// in real builds, so this only affects test execution.
vi.mock("@axiomhq/nextjs", () => ({
  createAxiomRouteHandler: () => (handler: unknown) => handler,
  nextJsFormatters: [],
}));

const ORIG_ENV = { ...process.env };

describe("buildTransports", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIG_ENV };
  });
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  it("returns no-op transport when NODE_ENV=test", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    process.env.AXIOM_TOKEN = "tok";
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(1);
    // No-op transport's `log` returns undefined (verify by calling it).
    // Transport.log takes an array of log events per @axiomhq/logging's typedef.
    expect(() => transports[0].log([{ level: "info", message: "x", fields: {}, _time: new Date().toISOString() }])).not.toThrow();
  });

  it("returns console-only when NODE_ENV=development", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.VERCEL_ENV;
    delete process.env.AXIOM_TOKEN;
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(1);
    // ConsoleTransport identifiable by constructor name
    expect(transports[0].constructor.name).toBe("ConsoleTransport");
  });

  it("returns Axiom + console when VERCEL_ENV=preview", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";
    process.env.AXIOM_TOKEN = "tok";
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(2);
    const names = transports.map((t) => t.constructor.name).sort();
    expect(names).toEqual(["AxiomJSTransport", "ConsoleTransport"]);
  });

  it("returns Axiom only when VERCEL_ENV=production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.AXIOM_TOKEN = "tok";
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(1);
    expect(transports[0].constructor.name).toBe("AxiomJSTransport");
  });

  it("degrades to console when AXIOM_TOKEN is missing in production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    delete process.env.AXIOM_TOKEN;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildTransports } = await import("@/lib/observability/logger");
    const transports = buildTransports();
    expect(transports.length).toBe(1);
    expect(transports[0].constructor.name).toBe("ConsoleTransport");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("AXIOM_TOKEN"));
    warnSpy.mockRestore();
  });
});
