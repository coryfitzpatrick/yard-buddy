import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";

const ORIG_ENV = { ...process.env };

function makeReq(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new NextRequest("https://example.com/api/cron/x", { headers });
}

describe("verifyCronAuth", () => {
  beforeEach(() => {
    process.env = { ...ORIG_ENV };
  });
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  it("returns 401 when CRON_SECRET is unset, even with a literal 'Bearer undefined' header", async () => {
    delete process.env.CRON_SECRET;
    const res = verifyCronAuth(makeReq("Bearer undefined"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is unset and no auth header is provided", () => {
    delete process.env.CRON_SECRET;
    const res = verifyCronAuth(makeReq());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("returns 401 when the provided token does not match", () => {
    process.env.CRON_SECRET = "secret-value";
    const res = verifyCronAuth(makeReq("Bearer wrong-token-x"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("returns 401 when no Authorization header is provided", () => {
    process.env.CRON_SECRET = "secret-value";
    const res = verifyCronAuth(makeReq());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("returns null when the provided token matches CRON_SECRET", () => {
    process.env.CRON_SECRET = "secret-value";
    const res = verifyCronAuth(makeReq("Bearer secret-value"));
    expect(res).toBeNull();
  });
});
