import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock withAxiom to be a transparent pass-through so the handler runs directly
vi.mock("@/lib/observability/logger", () => ({
  withAxiom: (fn: (...args: unknown[]) => unknown) => fn,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/observability/events", () => ({
  emitMowingApplied: vi.fn(),
  emitMowingDismissed: vi.fn(),
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

import { POST } from "@/app/api/sections/[sectionId]/mowing/apply/route";
import { auth } from "@/lib/auth";
import { emitMowingApplied } from "@/lib/observability/events";

const makeParams = (sectionId: string) => ({ params: Promise.resolve({ sectionId }) });

beforeEach(() => {
  mockYardSectionFindUnique.mockReset();
  mockLawnAnalysisFindFirst.mockReset();
  mockTransaction.mockReset();
  (auth as ReturnType<typeof vi.fn>).mockReset();
  (emitMowingApplied as ReturnType<typeof vi.fn>).mockReset();
});

describe("POST /api/sections/[sectionId]/mowing/apply", () => {
  it("returns 401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request("https://example.com/api/sections/s1/mowing/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(401);
    expect(mockYardSectionFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when section is not found", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue(null);
    const req = new Request("https://example.com/api/sections/s1/mowing/apply", { method: "POST" });
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
    const req = new Request("https://example.com/api/sections/s1/mowing/apply", { method: "POST" });
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
    const req = new Request("https://example.com/api/sections/s1/mowing/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(404);
  });

  it("returns 400 when mowingSuggestedDaysPerWeek is null", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      mowingSuggestedDaysPerWeek: null,
      mowingSuggestedHeightInches: 3.0,
    });
    const req = new Request("https://example.com/api/sections/s1/mowing/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no structured suggestion/i);
  });

  it("returns 400 when mowingSuggestedHeightInches is null", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      mowingSuggestedDaysPerWeek: 2,
      mowingSuggestedHeightInches: null,
    });
    const req = new Request("https://example.com/api/sections/s1/mowing/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(400);
  });

  it("200 Basic user (home_basic): writes to tx.yard.update, clears dismissedAt on analysis, emits with target=yard", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_basic" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      mowingSuggestedDaysPerWeek: 2,
      mowingSuggestedHeightInches: 3.0,
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

    const req = new Request("https://example.com/api/sections/s1/mowing/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ target: "yard", daysPerWeek: 2, heightInches: 3.0 });

    expect(txYardUpdate).toHaveBeenCalledWith({
      where: { id: "y1" },
      data: { mowingDaysPerWeek: 2, mowingHeightInches: 3.0 },
    });
    expect(txYardSectionUpdate).not.toHaveBeenCalled();
    expect(txLawnAnalysisUpdate).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { mowingRecommendationDismissedAt: null },
    });
    expect(emitMowingApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_basic", target: "yard" });
  });

  it("200 Plus user (home_plus): writes to tx.yardSection.update, emits with target=section", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yardId: "y1",
      yard: { user: { id: "u1", plan: "home_plus" } },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      mowingSuggestedDaysPerWeek: 3,
      mowingSuggestedHeightInches: 3.0,
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

    const req = new Request("https://example.com/api/sections/s1/mowing/apply", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ target: "section", daysPerWeek: 3, heightInches: 3.0 });

    expect(txYardSectionUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { mowingDaysPerWeek: 3, mowingHeightInches: 3.0 },
    });
    expect(txYardUpdate).not.toHaveBeenCalled();
    expect(txLawnAnalysisUpdate).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { mowingRecommendationDismissedAt: null },
    });
    expect(emitMowingApplied).toHaveBeenCalledWith({ sectionId: "s1", plan: "home_plus", target: "section" });
  });
});
