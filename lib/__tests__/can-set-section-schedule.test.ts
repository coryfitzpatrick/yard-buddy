import { describe, it, expect } from "vitest";
import { canSetSectionSchedule } from "@/lib/plan/can-set-section-schedule";

describe("canSetSectionSchedule", () => {
  it("returns false for home_basic", () => {
    expect(canSetSectionSchedule("home_basic")).toBe(false);
  });
  it("returns false for trial", () => {
    expect(canSetSectionSchedule("trial")).toBe(false);
  });
  it("returns true for home_plus", () => {
    expect(canSetSectionSchedule("home_plus")).toBe(true);
  });
  it("returns true for professional", () => {
    expect(canSetSectionSchedule("professional")).toBe(true);
  });
  it("returns false for null", () => {
    expect(canSetSectionSchedule(null)).toBe(false);
  });
});
