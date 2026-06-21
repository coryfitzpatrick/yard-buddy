import { describe, it, expect, vi, beforeEach } from "vitest";

const mockValidateRefreshToken = vi.fn();
const mockGenerateRefreshToken = vi.fn();
vi.mock("@/lib/auth/biometric-refresh", () => ({
  validateRefreshToken: (...args: unknown[]) => mockValidateRefreshToken(...args),
  generateRefreshToken: (...args: unknown[]) => mockGenerateRefreshToken(...args),
  hashRefreshToken: (token: string) => `hash(${token})`,
}));

const mockTransaction = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
    biometricRefreshToken: {
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const mockEncode = vi.fn();
vi.mock("next-auth/jwt", () => ({ encode: (...args: unknown[]) => mockEncode(...args) }));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: () => "127.0.0.1",
}));

import { POST } from "@/app/api/auth/biometric-exchange/route";

beforeEach(() => {
  mockValidateRefreshToken.mockReset();
  mockGenerateRefreshToken.mockReset();
  mockTransaction.mockReset();
  mockEncode.mockReset();
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ limited: false });
  process.env.AUTH_SECRET = "test-secret";
});

describe("POST /api/auth/biometric-exchange", () => {
  it("returns 400 on missing token", async () => {
    const req = new Request("https://example.com/api/auth/biometric-exchange", {
      method: "POST", body: JSON.stringify({}),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(400);
  });

  it("returns 401 when token is invalid", async () => {
    mockValidateRefreshToken.mockResolvedValue(null);
    const req = new Request("https://example.com/api/auth/biometric-exchange", {
      method: "POST", body: JSON.stringify({ token: "bad" }),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ limited: true });
    const req = new Request("https://example.com/api/auth/biometric-exchange", {
      method: "POST", body: JSON.stringify({ token: "anything" }),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(429);
    expect(mockValidateRefreshToken).not.toHaveBeenCalled();
  });

  it("on valid token: encodes a session JWT, rotates the refresh token, sets cookie via Set-Cookie", async () => {
    mockValidateRefreshToken.mockResolvedValue({ userId: "u1", rowId: "r-old" });
    mockGenerateRefreshToken.mockReturnValue({ token: "new-token", hash: "new-hash" });
    mockEncode.mockResolvedValue("encoded.jwt.value");
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        biometricRefreshToken: {
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({ id: "r-new" }),
        },
      };
      return fn(tx);
    });

    const req = new Request("https://example.com/api/auth/biometric-exchange", {
      method: "POST", body: JSON.stringify({ token: "old-token" }),
    });
    const res = await POST(req as never, undefined as never);

    expect(res.status).toBe(200);
    expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({
      token: expect.objectContaining({ id: "u1" }),
      secret: "test-secret",
    }));

    // Cookie was set
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("authjs.session-token=encoded.jwt.value");
    expect(setCookie?.toLowerCase()).toContain("httponly");
    expect(setCookie?.toLowerCase()).toContain("samesite=lax");
    // Verify Secure is NOT set in dev (test env). Cookie-attribute regression guard:
    // a `__Secure-` prefix sent without the Secure flag is silently dropped by the browser.
    expect(setCookie?.toLowerCase()).not.toContain("secure");

    const body = await res.json();
    expect(body).toEqual({ ok: true, token: "new-token" });
  });
});
