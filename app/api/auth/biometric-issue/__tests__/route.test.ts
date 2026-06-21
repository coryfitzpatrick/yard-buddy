import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { biometricRefreshToken: { create: (...args: unknown[]) => mockCreate(...args) } },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { POST } from "@/app/api/auth/biometric-issue/route";
import { auth } from "@/lib/auth";

describe("POST /api/auth/biometric-issue", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    (auth as ReturnType<typeof vi.fn>).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request("https://example.com/api/auth/biometric-issue", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a row with sha256(token) and returns plaintext token + id", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockCreate.mockImplementation(async ({ data }) => ({ id: "r1", ...data }));
    const req = new Request("https://example.com/api/auth/biometric-issue", {
      method: "POST",
      body: JSON.stringify({ deviceFingerprint: "ios:1.0:abcd" }),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.id).toBe("r1");
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        deviceFingerprint: "ios:1.0:abcd",
      }),
    });
  });

  it("accepts request without deviceFingerprint", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockCreate.mockImplementation(async ({ data }) => ({ id: "r1", ...data }));
    const req = new Request("https://example.com/api/auth/biometric-issue", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(200);
  });
});
