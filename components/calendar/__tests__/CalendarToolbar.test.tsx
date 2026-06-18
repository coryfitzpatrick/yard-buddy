// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { CalendarToolbar } from "../CalendarToolbar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("month=2026-04"),
}));

afterEach(cleanup);

const yards = [
  { id: "y1", slug: "front-yard", name: "Front Yard", sections: [{ id: "s1", slug: "main-lawn", name: "Main Lawn" }, { id: "s2", slug: "side-strip", name: "Side Strip" }] },
  { id: "y2", slug: "back-yard", name: "Back Yard", sections: [{ id: "s3", slug: "garden-bed", name: "Garden Bed" }] },
];

describe("CalendarToolbar", () => {
  it("renders all yard options including All Yards", () => {
    render(<CalendarToolbar yards={yards} selectedYard="" selectedSection="" month="2026-04" />);
    expect(screen.getByRole("option", { name: "All Yards" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Front Yard" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Back Yard" })).toBeInTheDocument();
  });

  it("renders All Sections option when no yard is selected", () => {
    render(<CalendarToolbar yards={yards} selectedYard="" selectedSection="" month="2026-04" />);
    expect(screen.getByRole("option", { name: "All Sections" })).toBeInTheDocument();
  });

  it("renders only sections for the selected yard", () => {
    render(<CalendarToolbar yards={yards} selectedYard="front-yard" selectedSection="" month="2026-04" />);
    expect(screen.getByRole("option", { name: "Main Lawn" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Side Strip" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Garden Bed" })).toBeNull();
  });

  it("displays the formatted month label", () => {
    render(<CalendarToolbar yards={yards} selectedYard="" selectedSection="" month="2026-04" />);
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("renders prev and next month buttons", () => {
    render(<CalendarToolbar yards={yards} selectedYard="" selectedSection="" month="2026-04" />);
    expect(screen.getByLabelText("Previous month")).toBeInTheDocument();
    expect(screen.getByLabelText("Next month")).toBeInTheDocument();
  });
});
