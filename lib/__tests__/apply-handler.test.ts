import { describe, it, expect } from "vitest";
import { applyTargetForPlan } from "@/lib/schedules/apply-handler";

describe("applyTargetForPlan", () => {
  it("returns 'yard' for home_basic", () => {
    expect(applyTargetForPlan("home_basic")).toBe("yard");
  });
  it("returns 'yard' for trial", () => {
    expect(applyTargetForPlan("trial")).toBe("yard");
  });
  it("returns 'section' for home_plus", () => {
    expect(applyTargetForPlan("home_plus")).toBe("section");
  });
  it("returns 'section' for professional", () => {
    expect(applyTargetForPlan("professional")).toBe("section");
  });
  it("returns 'section' for admin", () => {
    expect(applyTargetForPlan("admin")).toBe("section");
  });
  it("returns 'yard' for null", () => {
    expect(applyTargetForPlan(null)).toBe("yard");
  });
});
