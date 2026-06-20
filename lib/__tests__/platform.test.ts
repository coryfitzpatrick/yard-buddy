import { describe, it, expect, vi } from "vitest";
import { isMobileAppClient } from "@/lib/platform";

describe("isMobileAppClient", () => {
  it("returns false when navigator is undefined (SSR context)", () => {
    const orig = globalThis.navigator;
    delete (globalThis as { navigator?: unknown }).navigator;
    expect(isMobileAppClient()).toBe(false);
    globalThis.navigator = orig;
  });

  it("returns false for a normal browser UA", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/605" });
    expect(isMobileAppClient()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("returns true when UA contains the YardAnalyzerApp token", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605 Capacitor YardAnalyzerApp/1.0",
    });
    expect(isMobileAppClient()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("returns true for any YardAnalyzerApp/X.Y version", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Android) AppleWebKit/605 YardAnalyzerApp/2.7",
    });
    expect(isMobileAppClient()).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("isMobileApp (server-side)", () => {
  it("returns true when request header contains the token", async () => {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers({ "user-agent": "Mozilla/5.0 Capacitor YardAnalyzerApp/1.0" }),
    }));
    vi.resetModules();
    const { isMobileApp } = await import("@/lib/platform");
    expect(await isMobileApp()).toBe(true);
    vi.doUnmock("next/headers");
  });

  it("returns false when request header lacks the token", async () => {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (Macintosh) Safari" }),
    }));
    vi.resetModules();
    const { isMobileApp } = await import("@/lib/platform");
    expect(await isMobileApp()).toBe(false);
    vi.doUnmock("next/headers");
  });

  it("returns false when no user-agent header is present", async () => {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(),
    }));
    vi.resetModules();
    const { isMobileApp } = await import("@/lib/platform");
    expect(await isMobileApp()).toBe(false);
    vi.doUnmock("next/headers");
  });
});
