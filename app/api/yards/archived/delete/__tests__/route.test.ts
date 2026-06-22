import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    lawnAnalysis: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    yard: {
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { from: () => ({ remove: vi.fn().mockResolvedValue({ data: [], error: null }) }) },
  }),
}));

import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://test.local/api/yards/archived/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("yards/archived/delete route", () => {
  it("rejects wrong confirmation text", async () => {
    const res = await POST(jsonRequest({ confirmation: "delete" }) as never, undefined as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("confirmation_required");
  });

  it("returns deleted count when confirmation is correct", async () => {
    const res = await POST(jsonRequest({ confirmation: "DELETE" }) as never, undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(2);
  });
});
