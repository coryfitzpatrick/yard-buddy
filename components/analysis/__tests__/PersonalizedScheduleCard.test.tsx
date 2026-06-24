// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { PersonalizedScheduleCard } from "@/components/analysis/PersonalizedScheduleCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

const baseAnalysis = {
  wateringSuggestedDaysPerWeek: 3,
  wateringSuggestedMinutesPerSession: 20,
  mowingSuggestedDaysPerWeek: 1,
  mowingSuggestedHeightInches: 3,
};
const emptyEffective = {
  wateringDays: [],
  wateringTime: null,
  wateringMinutesPerSession: null,
  mowingDays: [],
  mowingTime: null,
  mowingHeightInches: null,
};

describe("PersonalizedScheduleCard - picker mode", () => {
  it("renders picker when user has no schedule", () => {
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_basic"
        latestAnalysis={baseAnalysis}
        effective={emptyEffective}
      />,
    );
    expect(screen.getByRole("button", { name: /save schedule/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip for now/i })).toBeInTheDocument();
  });

  it("shows apply-to-yard checkbox for home_basic", () => {
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_basic"
        latestAnalysis={baseAnalysis}
        effective={emptyEffective}
      />,
    );
    expect(screen.getByLabelText(/apply to whole yard/i)).toBeInTheDocument();
  });

  it("shows apply-to-yard checkbox for trial", () => {
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="trial"
        latestAnalysis={baseAnalysis}
        effective={emptyEffective}
      />,
    );
    expect(screen.getByLabelText(/apply to whole yard/i)).toBeInTheDocument();
  });

  it("shows apply-to-yard checkbox for home_plus", () => {
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_plus"
        latestAnalysis={baseAnalysis}
        effective={emptyEffective}
      />,
    );
    expect(screen.getByLabelText(/apply to whole yard/i)).toBeInTheDocument();
  });
});

describe("PersonalizedScheduleCard - confirmation mode", () => {
  it("renders confirmation when both kinds match user's current effective", () => {
    const matching = {
      wateringDays: ["Mon", "Wed", "Fri"],
      wateringTime: "07:00",
      wateringMinutesPerSession: 20,
      mowingDays: ["Sat"],
      mowingTime: "10:00",
      mowingHeightInches: 3,
    };
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_basic"
        latestAnalysis={baseAnalysis}
        effective={matching}
      />,
    );
    expect(screen.queryByRole("button", { name: /save schedule/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/still looks right/i).length).toBeGreaterThan(0);
  });
});

describe("PersonalizedScheduleCard - placeholder mode", () => {
  it("renders placeholder when both kinds have null suggestions", () => {
    const noSuggestions = {
      wateringSuggestedDaysPerWeek: null,
      wateringSuggestedMinutesPerSession: null,
      mowingSuggestedDaysPerWeek: null,
      mowingSuggestedHeightInches: null,
    };
    render(
      <PersonalizedScheduleCard
        sectionId="sec_1"
        plan="home_basic"
        latestAnalysis={noSuggestions}
        effective={emptyEffective}
      />,
    );
    expect(screen.getByText(/couldn't generate a schedule recommendation/i)).toBeInTheDocument();
  });
});
