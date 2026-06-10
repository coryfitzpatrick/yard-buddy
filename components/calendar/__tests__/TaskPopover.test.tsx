// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { TaskPopover } from "../TaskPopover";
import type { CalendarTask } from "@/lib/calendar-utils";

afterEach(cleanup);

const baseTask: CalendarTask = {
  id: "t1",
  title: "Apply pre-emergent",
  description: "Apply before soil temps reach 55°F to close the crabgrass window.",
  status: "pending",
  scheduledStart: "2026-04-05T00:00:00.000Z",
  scheduledEnd: "2026-04-11T00:00:00.000Z",
  product: null,
  productSearchQuery: null,
  sectionId: "s1",
  sectionName: "Main Lawn",
  yardId: "y1",
  yardName: "Front Yard",
};

describe("TaskPopover", () => {
  it("renders task title and description", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.getByText("Apply pre-emergent")).toBeInTheDocument();
    expect(screen.getByText(/Apply before soil temps/)).toBeInTheDocument();
  });

  it("renders section and yard name", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.getByText(/Main Lawn/)).toBeInTheDocument();
    expect(screen.getByText(/Front Yard/)).toBeInTheDocument();
  });

  it("renders the date range", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.getByText(/Apr 5/)).toBeInTheDocument();
    expect(screen.getByText(/Apr 11/)).toBeInTheDocument();
  });

  it("renders Pending status badge for pending tasks", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders Completed status badge for completed tasks", () => {
    render(<TaskPopover task={{ ...baseTask, status: "completed" }} onClose={vi.fn()} />);
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  it("does NOT render buy link when product is null", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    expect(screen.queryByText(/Buy:/)).toBeNull();
  });

  it("renders buy link when product is set", () => {
    const task = { ...baseTask, product: "Scotts Halts", productSearchQuery: "Scotts Halts crabgrass preventer" };
    render(<TaskPopover task={task} onClose={vi.fn()} />);
    const link = screen.getByText(/Buy: Scotts Halts/);
    expect(link.closest("a")).toHaveAttribute("href", expect.stringContaining("google.com/search"));
    expect(link.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("uses productSearchQuery in the buy link when set", () => {
    const task = { ...baseTask, product: "Scotts Halts", productSearchQuery: "Scotts Halts 10000 sqft" };
    render(<TaskPopover task={task} onClose={vi.fn()} />);
    const link = screen.getByText(/Buy: Scotts Halts/).closest("a")!;
    expect(link.getAttribute("href")).toContain(encodeURIComponent("Scotts Halts 10000 sqft"));
  });

  it("renders View section link pointing to section page", () => {
    render(<TaskPopover task={baseTask} onClose={vi.fn()} />);
    const link = screen.getByRole("link", { name: /View section/i });
    expect(link).toHaveAttribute("href", "/yard/y1/sections/s1");
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<TaskPopover task={baseTask} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
