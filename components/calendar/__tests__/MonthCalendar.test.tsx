// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { MonthCalendar } from "../MonthCalendar";
import type { CalendarTask } from "@/lib/calendar-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const task: CalendarTask = {
  id: "t1",
  title: "Fertilize lawn",
  description: "Apply granular fertilizer evenly.",
  status: "pending",
  scheduledStart: "2026-04-05T00:00:00.000Z", // Sunday week 2
  scheduledEnd: "2026-04-07T00:00:00.000Z",   // Tuesday week 2
  product: null,
  productSearchQuery: null,
  sectionId: "s1",
  sectionName: "Main Lawn",
  yardId: "y1",
  yardName: "Front Yard",
};

const yards = [{ id: "y1", name: "Front Yard", sections: [{ id: "s1", name: "Main Lawn" }] }];

describe("MonthCalendar", () => {
  it("renders day of week headers", () => {
    render(<MonthCalendar tasks={[]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });

  it("renders the task title as a bar", () => {
    render(<MonthCalendar tasks={[task]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    expect(screen.getByText(/Fertilize lawn/)).toBeInTheDocument();
  });

  it("shows popover when a task bar is clicked", () => {
    render(<MonthCalendar tasks={[task]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    fireEvent.click(screen.getByText(/Fertilize lawn/));
    expect(screen.getByText("Apply granular fertilizer evenly.")).toBeInTheDocument();
  });

  it("closes popover when close button is clicked", () => {
    render(<MonthCalendar tasks={[task]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    fireEvent.click(screen.getByText(/Fertilize lawn/));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByText("Apply granular fertilizer evenly.")).toBeNull();
  });

  it("shows No tasks scheduled for empty weeks", () => {
    render(<MonthCalendar tasks={[]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    const emptyMessages = screen.getAllByText("No tasks scheduled");
    expect(emptyMessages.length).toBeGreaterThan(0);
  });

  it("renders continuation arrow when task spans multiple weeks", () => {
    const multiWeekTask: CalendarTask = {
      ...task,
      scheduledStart: "2026-04-05T00:00:00.000Z",
      scheduledEnd: "2026-04-15T00:00:00.000Z",
    };
    render(<MonthCalendar tasks={[multiWeekTask]} month="2026-04" gridStart="2026-03-29T00:00:00.000Z" yards={yards} selectedYard="" selectedSection="" />);
    expect(screen.getByText(/→/)).toBeInTheDocument();
  });
});
