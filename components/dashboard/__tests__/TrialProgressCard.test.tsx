// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { TrialProgressCard } from "../TrialProgressCard";

afterEach(cleanup);

describe("TrialProgressCard", () => {
  const futureDate = new Date(Date.now() + 14 * 86400 * 1000);

  it("renders neither-done state when no progress", () => {
    render(
      <TrialProgressCard
        scheduleSet={false}
        taskCompleted={false}
        bonusAlreadyGranted={false}
        trialEndsAt={futureDate}
      />
    );
    expect(screen.getByText(/Earn 7 more trial days/i)).toBeInTheDocument();
    expect(screen.getByText(/Set a watering or mowing schedule/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete a task/i)).toBeInTheDocument();
  });

  it("renders schedule-done state with one checkbox checked", () => {
    render(
      <TrialProgressCard
        scheduleSet={true}
        taskCompleted={false}
        bonusAlreadyGranted={false}
        trialEndsAt={futureDate}
      />
    );
    expect(screen.getByText(/Schedule set/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete a task/i)).toBeInTheDocument();
  });

  it("renders celebration state when bonus already granted", () => {
    render(
      <TrialProgressCard
        scheduleSet={true}
        taskCompleted={true}
        bonusAlreadyGranted={true}
        trialEndsAt={futureDate}
      />
    );
    expect(screen.getByText(/You earned 7 more trial days/i)).toBeInTheDocument();
  });

  it("renders nothing when bonus granted more than 24 hours ago", () => {
    const oldGrant = new Date(Date.now() - 25 * 3600 * 1000);
    const { container } = render(
      <TrialProgressCard
        scheduleSet={true}
        taskCompleted={true}
        bonusAlreadyGranted={true}
        bonusGrantedAt={oldGrant}
        trialEndsAt={futureDate}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
