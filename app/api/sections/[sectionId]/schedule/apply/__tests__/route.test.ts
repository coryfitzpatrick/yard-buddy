import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/observability/logger", () => ({
  withAxiom: (fn: (...a: unknown[]) => unknown) => fn,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/observability/events", () => ({
  emitWateringApplied: vi.fn(),
  emitMowingApplied: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const findUnique = vi.fn();
const findFirst = vi.fn();
const transaction = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    yardSection: { findUnique: (...a: unknown[]) => findUnique(...a) },
    lawnAnalysis: { findFirst: (...a: unknown[]) => findFirst(...a) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

import { POST } from "@/app/api/sections/[sectionId]/schedule/apply/route";
import { auth } from "@/lib/auth";
import { emitWateringApplied, emitMowingApplied } from "@/lib/observability/events";

const params = (id: string) => ({ params: Promise.resolve({ sectionId: id }) });
const body = (overrides: Partial<Record<string, unknown>> = {}) => ({
  watering: { days: ["Mon", "Wed", "Fri"], time: "07:00", minutesPerSession: 20 },
  mowing: { days: ["Sat"], time: "10:00", heightInches: 3 },
  applyToYard: false,
  ...overrides,
});

const req = (b: unknown) =>
  new Request("https://example.com/api/sections/s1/schedule/apply", {
    method: "POST",
    body: JSON.stringify(b),
  });

beforeEach(() => {
  findUnique.mockReset();
  findFirst.mockReset();
  transaction.mockReset();
  (auth as ReturnType<typeof vi.fn>).mockReset();
  (emitWateringApplied as ReturnType<typeof vi.fn>).mockReset();
  (emitMowingApplied as ReturnType<typeof vi.fn>).mockReset();
});

describe("POST /api/sections/[sectionId]/schedule/apply", () => {
  it("401 unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(req(body()) as never, params("s1") as never);
    expect(res.status).toBe(401);
  });

  it("400 invalid body", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(req({ watering: "nope" }) as never, params("s1") as never);
    expect(res.status).toBe(400);
  });

  it("404 not found or wrong owner", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue(null);
    const res = await POST(req(body()) as never, params("s1") as never);
    expect(res.status).toBe(404);
  });

  it("Basic with applyToYard:false writes to section", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    findFirst.mockResolvedValue({ id: "a1" });
    const yardUpdate = vi.fn().mockResolvedValue({});
    const sectionUpdate = vi.fn().mockResolvedValue({});
    const analysisUpdate = vi.fn().mockResolvedValue({});
    transaction.mockImplementation(async (fn) =>
      fn({
        yard: { update: yardUpdate },
        yardSection: { update: sectionUpdate },
        lawnAnalysis: { update: analysisUpdate },
      }),
    );
    const res = await POST(req(body({ applyToYard: false })) as never, params("s1") as never);
    expect(res.status).toBe(200);
    expect(sectionUpdate).toHaveBeenCalled();
    expect(yardUpdate).not.toHaveBeenCalled();
    expect(analysisUpdate).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { wateringRecommendationDismissedAt: null, mowingRecommendationDismissedAt: null },
    });
    expect(emitWateringApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_basic", target: "section" });
    expect(emitMowingApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_basic", target: "section" });
  });

  it("Plus with applyToYard:false writes to section", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_plus" } },
    });
    findFirst.mockResolvedValue({ id: "a1" });
    const yardUpdate = vi.fn().mockResolvedValue({});
    const sectionUpdate = vi.fn().mockResolvedValue({});
    const analysisUpdate = vi.fn().mockResolvedValue({});
    transaction.mockImplementation(async (fn) =>
      fn({
        yard: { update: yardUpdate },
        yardSection: { update: sectionUpdate },
        lawnAnalysis: { update: analysisUpdate },
      }),
    );
    const res = await POST(req(body({ applyToYard: false })) as never, params("s1") as never);
    expect(res.status).toBe(200);
    expect(sectionUpdate).toHaveBeenCalled();
    expect(yardUpdate).not.toHaveBeenCalled();
    expect(emitWateringApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_plus", target: "section" });
  });

  it("Plus with applyToYard:true writes to yard", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_plus" } },
    });
    findFirst.mockResolvedValue({ id: "a1" });
    const yardUpdate = vi.fn().mockResolvedValue({});
    const sectionUpdate = vi.fn().mockResolvedValue({});
    const analysisUpdate = vi.fn().mockResolvedValue({});
    transaction.mockImplementation(async (fn) =>
      fn({
        yard: { update: yardUpdate },
        yardSection: { update: sectionUpdate },
        lawnAnalysis: { update: analysisUpdate },
      }),
    );
    const res = await POST(req(body({ applyToYard: true })) as never, params("s1") as never);
    expect(res.status).toBe(200);
    expect(yardUpdate).toHaveBeenCalled();
    expect(sectionUpdate).not.toHaveBeenCalled();
  });

  it("skips analysis update when no analysis exists yet", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    findFirst.mockResolvedValue(null);
    const yardUpdate = vi.fn().mockResolvedValue({});
    const sectionUpdate = vi.fn().mockResolvedValue({});
    const analysisUpdate = vi.fn().mockResolvedValue({});
    transaction.mockImplementation(async (fn) =>
      fn({
        yard: { update: yardUpdate },
        yardSection: { update: sectionUpdate },
        lawnAnalysis: { update: analysisUpdate },
      }),
    );
    const res = await POST(req(body()) as never, params("s1") as never);
    expect(res.status).toBe(200);
    expect(analysisUpdate).not.toHaveBeenCalled();
  });
});
