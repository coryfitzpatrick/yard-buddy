// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ScheduleRecommendationCard } from "@/components/sections/ScheduleRecommendationCard";

afterEach(cleanup);

const baseAnalysis = {
  id: "an_1",
  wateringSchedule: "Your 3x/week, 20 min schedule works well.",
  wateringDeviates: false,
  wateringSuggestedDaysPerWeek: 3,
  wateringSuggestedMinutesPerSession: 20,
  wateringRecommendationDismissedAt: null,
  mowingSchedule: null,
  mowingDeviates: null,
  mowingSuggestedDaysPerWeek: null,
  mowingSuggestedHeightInches: null,
  mowingRecommendationDismissedAt: null,
};

const baseEffective = { daysPerWeek: 3, minutesPerSession: 20, heightInches: null };

describe("ScheduleRecommendationCard - watering", () => {
  it("state A: shows empty state when no analysis", () => {
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={null} effective={baseEffective} plan="home_basic" />);
    expect(screen.getByText(/run an analysis/i)).toBeInTheDocument();
  });

  it("state B: shows neutral confirmation when not deviating", () => {
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={baseAnalysis} effective={baseEffective} plan="home_basic" />);
    expect(screen.getByText(/works well/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ignore/i })).not.toBeInTheDocument();
  });

  it("state C: shows Apply and Ignore when deviating and not dismissed", () => {
    const dev = { ...baseAnalysis, wateringDeviates: true, wateringSuggestedMinutesPerSession: 15 };
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={dev} effective={baseEffective} plan="home_basic" />);
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ignore/i })).toBeInTheDocument();
  });

  it("state D: shows banner when deviating and dismissed", () => {
    const dev = { ...baseAnalysis, wateringDeviates: true, wateringSuggestedMinutesPerSession: 15, wateringRecommendationDismissedAt: new Date() };
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={dev} effective={baseEffective} plan="home_basic" />);
    expect(screen.getByText(/schedule override/i)).toBeInTheDocument();
  });

  it("collapses state D to B when effective schedule matches saved suggestion", () => {
    // User manually edited yard to match the suggestion; even though dismissed, stillDeviates is false.
    const dev = { ...baseAnalysis, wateringDeviates: true, wateringSuggestedDaysPerWeek: 3, wateringSuggestedMinutesPerSession: 15, wateringRecommendationDismissedAt: new Date() };
    const matching = { daysPerWeek: 3, minutesPerSession: 15, heightInches: null };
    render(<ScheduleRecommendationCard kind="watering" sectionId="sec_1" latestAnalysis={dev} effective={matching} plan="home_basic" />);
    expect(screen.queryByText(/schedule override/i)).not.toBeInTheDocument();
  });
});
