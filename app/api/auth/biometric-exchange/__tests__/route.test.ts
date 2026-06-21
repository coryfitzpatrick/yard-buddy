import { describe, it, expect, vi, beforeEach } from "vitest";

const mockValidateAndConsume = vi.fn();
const mockGenerateRefreshToken = vi.fn();
vi.mock("@/lib/auth/biometric-refresh", () => ({
  validateAndConsume: (...args: unknown[]) => mockValidateAndConsume(...args),
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

import { POST } from "@/app/api/auth/biometric-exchange/route";

beforeEach(() => {
  mockValidateAndConsume.mockReset();
  mockGenerateRefreshToken.mockReset();
  mockTransaction.mockReset();
  mockEncode.mockReset();
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
    mockValidateAndConsume.mockResolvedValue(null);
    const req = new Request("https://example.com/api/auth/biometric-exchange", {
      method: "POST", body: JSON.stringify({ token: "bad" }),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(401);
  });

  it("on valid token: encodes a session JWT, rotates the refresh token, sets cookie via Set-Cookie", async () => {
    mockValidateAndConsume.mockResolvedValue({ userId: "u1", rowId: "r-old" });
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

    const body = await res.json();
    expect(body).toEqual({ ok: true, token: "new-token" });
  });
});
