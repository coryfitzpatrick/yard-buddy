import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDeleteMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { deviceToken: { deleteMany: (...args: unknown[]) => mockDeleteMany(...args) } },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { DELETE } from "@/app/api/devices/[id]/route";
import { auth } from "@/lib/auth";

describe("DELETE /api/devices/[id]", () => {
  beforeEach(() => {
    mockDeleteMany.mockReset();
    (auth as ReturnType<typeof vi.fn>).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request("https://example.com/api/devices/dt1", { method: "DELETE" });
    const ctx = { params: Promise.resolve({ id: "dt1" }) };
    const res = await DELETE(req as never, ctx as never);
    expect(res.status).toBe(401);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes the user's own row scoped by userId (IDOR-safe)", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockDeleteMany.mockResolvedValue({ count: 1 });
    const req = new Request("https://example.com/api/devices/dt1", { method: "DELETE" });
    const ctx = { params: Promise.resolve({ id: "dt1" }) };
    const res = await DELETE(req as never, ctx as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 1 });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "dt1", userId: "u1" } });
  });

  it("returns deleted: 0 when the row doesn't exist or belongs to another user", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockDeleteMany.mockResolvedValue({ count: 0 });
    const req = new Request("https://example.com/api/devices/dt-other", { method: "DELETE" });
    const ctx = { params: Promise.resolve({ id: "dt-other" }) };
    const res = await DELETE(req as never, ctx as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 0 });
  });
});
