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
const mockLawnAnalysisUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    yardSection: { findUnique: (...args: unknown[]) => mockYardSectionFindUnique(...args) },
    lawnAnalysis: {
      findFirst: (...args: unknown[]) => mockLawnAnalysisFindFirst(...args),
      update: (...args: unknown[]) => mockLawnAnalysisUpdate(...args),
    },
  },
}));

import { POST } from "@/app/api/sections/[sectionId]/mowing/dismiss/route";
import { auth } from "@/lib/auth";
import { emitMowingDismissed } from "@/lib/observability/events";

const makeParams = (sectionId: string) => ({ params: Promise.resolve({ sectionId }) });

beforeEach(() => {
  mockYardSectionFindUnique.mockReset();
  mockLawnAnalysisFindFirst.mockReset();
  mockLawnAnalysisUpdate.mockReset();
  (auth as ReturnType<typeof vi.fn>).mockReset();
  (emitMowingDismissed as ReturnType<typeof vi.fn>).mockReset();
});

describe("POST /api/sections/[sectionId]/mowing/dismiss", () => {
  it("returns 401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request("https://example.com/api/sections/s1/mowing/dismiss", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(401);
    expect(mockYardSectionFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when section is not found", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue(null);
    const req = new Request("https://example.com/api/sections/s1/mowing/dismiss", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 when section belongs to a different user", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yard: { userId: "other-user" },
    });
    const req = new Request("https://example.com/api/sections/s1/mowing/dismiss", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 when no LawnAnalysis exists for the section", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yard: { userId: "u1" },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue(null);
    const req = new Request("https://example.com/api/sections/s1/mowing/dismiss", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(404);
  });

  it("returns 409 when mowingDeviates is false", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yard: { userId: "u1" },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      mowingDeviates: false,
    });
    const req = new Request("https://example.com/api/sections/s1/mowing/dismiss", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(409);
    expect(mockLawnAnalysisUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 when mowingDeviates is null", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yard: { userId: "u1" },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      mowingDeviates: null,
    });
    const req = new Request("https://example.com/api/sections/s1/mowing/dismiss", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    expect(res.status).toBe(409);
    expect(mockLawnAnalysisUpdate).not.toHaveBeenCalled();
  });

  it("200 success: updates mowingRecommendationDismissedAt, emits emitMowingDismissed, returns { ok: true }", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockYardSectionFindUnique.mockResolvedValue({
      id: "s1",
      yard: { userId: "u1" },
    });
    mockLawnAnalysisFindFirst.mockResolvedValue({
      id: "a1",
      mowingDeviates: true,
    });
    mockLawnAnalysisUpdate.mockResolvedValue({});

    const before = new Date();
    const req = new Request("https://example.com/api/sections/s1/mowing/dismiss", { method: "POST" });
    const res = await POST(req as never, makeParams("s1") as never);
    const after = new Date();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(mockLawnAnalysisUpdate).toHaveBeenCalledOnce();
    const updateCall = mockLawnAnalysisUpdate.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "a1" });
    expect(updateCall.data.mowingRecommendationDismissedAt).toBeInstanceOf(Date);
    const dismissedAt = updateCall.data.mowingRecommendationDismissedAt as Date;
    expect(dismissedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(dismissedAt.getTime()).toBeLessThanOrEqual(after.getTime());

    expect(emitMowingDismissed).toHaveBeenCalledWith({ sectionId: "s1" });
  });
});
