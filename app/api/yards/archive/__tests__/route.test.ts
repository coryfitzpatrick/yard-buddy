import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    yard: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { POST } from "../route";
import { db } from "@/lib/db";

function jsonRequest(body: unknown) {
  return new Request("http://test.local/api/yards/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("yards/archive route", () => {
  beforeEach(() => {
    (db.yard.findMany as ReturnType<typeof vi.fn>).mockReset();
    (db.yard.updateMany as ReturnType<typeof vi.fn>).mockReset();
  });

  it("contract #1: valid owned not-archived yards → archives each, returns count", async () => {
    (db.yard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "y_a" },
      { id: "y_b" },
    ]);
    (db.yard.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });

    const res = await POST(jsonRequest({ archiveYardIds: ["y_a", "y_b"] }) as never, {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.archived).toBe(2);
    // Update must scope to the current user AND archivedAt: null inside its own where to
    // prevent re-archiving an already archived yard. We check the update call shape.
    const updateCall = (db.yard.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.where.id.in).toEqual(["y_a", "y_b"]);
    expect(updateCall.where.userId).toBe("user-1");
    expect(updateCall.data.archivedAt).toBeInstanceOf(Date);
  });

  it("contract #2: empty array → 400, no DB writes", async () => {
    const res = await POST(jsonRequest({ archiveYardIds: [] }) as never, {} as never);
    expect(res.status).toBe(400);
    expect((db.yard.updateMany as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("contract #2: non-array → 400", async () => {
    const res = await POST(jsonRequest({ archiveYardIds: "not-an-array" }) as never, {} as never);
    expect(res.status).toBe(400);
  });

  it("contract #2: non-string elements → 400", async () => {
    const res = await POST(jsonRequest({ archiveYardIds: [1, 2] }) as never, {} as never);
    expect(res.status).toBe(400);
  });

  it("contract #3: includes an id the user doesn't own → 400 archive_invalid_ids", async () => {
    // Caller asks to archive y_a and y_b, but only y_a is owned + active
    (db.yard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "y_a" }]);

    const res = await POST(jsonRequest({ archiveYardIds: ["y_a", "y_b"] }) as never, {} as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("archive_invalid_ids");
    expect((db.yard.updateMany as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("contract #3: includes an already-archived id → 400 (treated as invalid)", async () => {
    // findMany filters to archivedAt: null and returns just y_a. y_b is implicitly already
    // archived and so excluded by that filter — counted as invalid.
    (db.yard.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "y_a" }]);

    const res = await POST(jsonRequest({ archiveYardIds: ["y_a", "y_b"] }) as never, {} as never);
    expect(res.status).toBe(400);
    expect((db.yard.updateMany as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("invalid JSON body → 400", async () => {
    const res = await POST(new Request("http://test.local/api/yards/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }) as never, {} as never);
    expect(res.status).toBe(400);
  });
});
