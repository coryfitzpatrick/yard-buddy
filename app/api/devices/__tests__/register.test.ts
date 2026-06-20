import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { deviceToken: { upsert: (...args: unknown[]) => mockUpsert(...args) } },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { POST } from "@/app/api/devices/register/route";
import { auth } from "@/lib/auth";

describe("POST /api/devices/register", () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    (auth as ReturnType<typeof vi.fn>).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request("https://example.com/api/devices/register", {
      method: "POST",
      body: JSON.stringify({ token: "abc", platform: "ios" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("https://example.com/api/devices/register", {
      method: "POST",
      body: JSON.stringify({ token: "abc", platform: "windows" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts on valid input and returns 200", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockUpsert.mockResolvedValue({ id: "dt1", userId: "u1", token: "fcm-token-abc", platform: "ios" });
    const req = new Request("https://example.com/api/devices/register", {
      method: "POST",
      body: JSON.stringify({ token: "fcm-token-abc", platform: "ios" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: "fcm-token-abc" },
        update: expect.objectContaining({ userId: "u1", platform: "ios" }),
        create: expect.objectContaining({ userId: "u1", token: "fcm-token-abc", platform: "ios" }),
      }),
    );
  });
});
