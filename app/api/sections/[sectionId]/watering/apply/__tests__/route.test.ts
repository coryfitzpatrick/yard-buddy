import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock withAxiom to be a transparent pass-through so the handler runs directly
vi.mock("@/lib/observability/logger", () => ({
  withAxiom: (fn: (...args: unknown[]) => unknown) => fn,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/observability/events", () => ({
  emitWateringApplied: vi.fn(),
  emitWateringDismissed: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockYardSectionFindUnique = vi.fn();
const mockLawnAnalysisFindFirst = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    yardSection: { findUnique: (...args: unknown[]) => mockYardSectionFindUnique(...args) },
    lawnAnalysis: { findFirst: (...args: unknown[]) => mockLawnAnalysisFindFirst(...args) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

import { POST } from "@/app/api/sections/[sectionId]/watering/apply/route";
import { auth } from "@/lib/auth";
import { emitWateringApplied } from "@/lib/observability/events";

const makeParams = (sectionId: string) => ({ params: Promise.resolve({ sectionId }) });

beforeEach(() => {
  mockYardSectionFindUnique.mockReset();
  mockLawnAnalysisFindFirst.mockReset();
  mockTransaction.mockReset();
  (auth as ReturnType<typeof vi.fn>).mockReset();
  (emitWateringApplied as ReturnType<typeof vi.fn>).mockReset();
});

describe("POST /api/sections/[sectionId]/watering/apply", () => {
  it("returns 401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request("https://example.com/api/sections/s1/watering/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(401);
    expect(mockYardSectionFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when section is not found", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue(null);
    const req = new Request("https://example.com/api/sections/s1/watering/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 when section belongs to a different user", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "other-user", plan: "home_basic" } },
    });
    const req = new Request("https://example.com/api/sections/s1/watering/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 when no LawnAnalysis exists for the section", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue(null);
    const req = new Request("https://example.com/api/sections/s1/watering/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(404);
  });

  it("returns 400 when wateringSuggestedMinutesPerSession is null", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      wateringSuggestedMinutesPerSession: null,
    });
    const req = new Request("https://example.com/api/sections/s1/watering/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no structured suggestion/i);
  });

  it("succeeds even when wateringSuggestedDaysPerWeek is null (only minutes is required)", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      wateringSuggestedDaysPerWeek: null,
      wateringSuggestedMinutesPerSession: 20,
    });

    const txYardUpdate = vi.fn().mockResolvedValue({});
    const txYardSectionUpdate = vi.fn().mockResolvedValue({});
    const txLawnAnalysisUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        yard: { update: txYardUpdate },
        yardSection: { update: txYardSectionUpdate },
        lawnAnalysis: { update: txLawnAnalysisUpdate },
      };
      return fn(tx);
    });

    const req = new Request("https://example.com/api/sections/s1/watering/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(200);
  });

  it("200 Basic user: writes only wateringMinutesPerSession to tx.yard.update; clears dismissedAt; emits", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      wateringSuggestedMinutesPerSession: 20,
    });

    const txYardUpdate = vi.fn().mockResolvedValue({});
    const txYardSectionUpdate = vi.fn().mockResolvedValue({});
    const txLawnAnalysisUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        yard: { update: txYardUpdate },
        yardSection: { update: txYardSectionUpdate },
        lawnAnalysis: { update: txLawnAnalysisUpdate },
      };
      return fn(tx);
    });

    const req = new Request("https://example.com/api/sections/s1/watering/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ target: "yard", minutesPerSession: 20 });

    expect(txYardUpdate).toHaveBeenCalledWith({
      where: { id: "y1" },
      data: { wateringMinutesPerSession: 20 },
    });
    expect(txYardSectionUpdate).not.toHaveBeenCalled();
    expect(txLawnAnalysisUpdate).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { wateringRecommendationDismissedAt: null },
    });
    expect(emitWateringApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_basic", target: "yard" });
  });

  it("200 Plus user: writes only wateringMinutesPerSession to tx.yardSection.update; emits with target=section", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_plus" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      wateringSuggestedMinutesPerSession: 15,
    });

    const txYardUpdate = vi.fn().mockResolvedValue({});
    const txYardSectionUpdate = vi.fn().mockResolvedValue({});
    const txLawnAnalysisUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        yard: { update: txYardUpdate },
        yardSection: { update: txYardSectionUpdate },
        lawnAnalysis: { update: txLawnAnalysisUpdate },
      };
      return fn(tx);
    });

    const req = new Request("https://example.com/api/sections/s1/watering/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ target: "section", minutesPerSession: 15 });

    expect(txYardSectionUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { wateringMinutesPerSession: 15 },
    });
    expect(txYardUpdate).not.toHaveBeenCalled();
    expect(emitWateringApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_plus", target: "section" });
  });

  it("200 with days+time in body: writes wateringDays and wateringTime alongside minutesPerSession", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      wateringSuggestedMinutesPerSession: 20,
    });

    const txYardUpdate = vi.fn().mockResolvedValue({});
    const txYardSectionUpdate = vi.fn().mockResolvedValue({});
    const txLawnAnalysisUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        yard: { update: txYardUpdate },
        yardSection: { update: txYardSectionUpdate },
        lawnAnalysis: { update: txLawnAnalysisUpdate },
      };
      return fn(tx);
    });

    const req = new Request("https://example.com/api/sections/s1/watering/apply", {
      method: "POST",
      body: JSON.stringify({ days: ["Mon", "Wed", "Fri"], time: "07:00" }),
    });
    const res = await POST(req as never, makeParams("s1") as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ target: "yard", minutesPerSession: 20, days: ["Mon", "Wed", "Fri"], time: "07:00" });

    expect(txYardUpdate).toHaveBeenCalledWith({
      where: { id: "y1" },
      data: { wateringMinutesPerSession: 20, wateringDays: ["Mon", "Wed", "Fri"], wateringTime: "07:00" },
    });
  });

  it("200 empty body still works (no days/time written)", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      wateringSuggestedMinutesPerSession: 20,
    });

    const txYardUpdate = vi.fn().mockResolvedValue({});
    const txYardSectionUpdate = vi.fn().mockResolvedValue({});
    const txLawnAnalysisUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        yard: { update: txYardUpdate },
        yardSection: { update: txYardSectionUpdate },
        lawnAnalysis: { update: txLawnAnalysisUpdate },
      };
      return fn(tx);
    });

    const req = new Request("https://example.com/api/sections/s1/watering/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ target: "yard", minutesPerSession: 20 });

    expect(txYardUpdate).toHaveBeenCalledWith({
      where: { id: "y1" },
      data: { wateringMinutesPerSession: 20 },
    });
  });
});
