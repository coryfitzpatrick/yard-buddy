import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDeleteMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { deviceToken: { deleteMany: (...args: unknown[]) => mockDeleteMany(...args) } },
}));

const mockVerify = vi.fn();
vi.mock("@/lib/email", () => ({
  verifyUnsubscribeToken: (...args: unknown[]) => mockVerify(...args),
}));

import { GET } from "@/app/api/notifications/unsubscribe-push/route";

describe("GET /api/notifications/unsubscribe-push", () => {
  beforeEach(() => {
    mockDeleteMany.mockReset();
    mockVerify.mockReset();
  });

  it("returns 400 when token query param is missing", async () => {
    const res = await GET(new Request("https://example.com/api/notifications/unsubscribe-push") as never, undefined as never);
    expect(res.status).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 400 when verifyUnsubscribeToken returns null (invalid/expired)", async () => {
    mockVerify.mockReturnValue(null);
    const res = await GET(new Request("https://example.com/api/notifications/unsubscribe-push?token=bad") as never, undefined as never);
    expect(res.status).toBe(400);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes all device tokens for the userId on valid token", async () => {
    mockVerify.mockReturnValue("u1");
    mockDeleteMany.mockResolvedValue({ count: 3 });
    const res = await GET(new Request("https://example.com/api/notifications/unsubscribe-push?token=valid") as never, undefined as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 3 });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});
