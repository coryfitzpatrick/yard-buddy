// lib/observability/__tests__/redact.test.ts
import { describe, it, expect } from "vitest";
import { hashEmail, hashIp } from "@/lib/observability/redact";

describe("hashEmail", () => {
  it("returns an 8-character hex prefix", () => {
    const h = hashEmail("user@example.com");
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic", () => {
    expect(hashEmail("user@example.com")).toBe(hashEmail("user@example.com"));
  });

  it("differs across inputs", () => {
    expect(hashEmail("a@example.com")).not.toBe(hashEmail("b@example.com"));
  });
});

describe("hashIp", () => {
  it("returns an 8-character hex prefix", () => {
    expect(hashIp("203.0.113.5")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("returns 'unknown' for the unknown sentinel without hashing it", () => {
    expect(hashIp("unknown")).toBe("unknown");
  });

  it("is deterministic", () => {
    expect(hashIp("203.0.113.5")).toBe(hashIp("203.0.113.5"));
  });
});
