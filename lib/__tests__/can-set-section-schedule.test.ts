import { describe, it, expect } from "vitest";
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

describe("canSetSectionSchedule", () => {
  it("returns true for home_basic", () => {
    expect(canSetSectionSchedule("home_basic")).toBe(true);
  });
  it("returns true for trial", () => {
    expect(canSetSectionSchedule("trial")).toBe(true);
  });
  it("returns true for home_plus", () => {
    expect(canSetSectionSchedule("home_plus")).toBe(true);
  });
  it("returns true for professional", () => {
    expect(canSetSectionSchedule("professional")).toBe(true);
  });
  it("returns true for admin", () => {
    expect(canSetSectionSchedule("admin")).toBe(true);
  });
  it("returns false for null", () => {
    expect(canSetSectionSchedule(null)).toBe(false);
  });
  it("returns false for expired", () => {
    expect(canSetSectionSchedule("expired")).toBe(false);
  });
});
