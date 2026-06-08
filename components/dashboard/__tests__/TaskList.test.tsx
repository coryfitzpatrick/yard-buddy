// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { TaskList } from "../TaskList";

const baseTask = {
  id: "t1",
  title: "Apply fertilizer",
  description: "Apply now",
  priority: "medium",
  status: "pending",
  scheduledStart: null,
  scheduledEnd: null,
  overdueNote: null,
  stillWorthDoing: null,
  product: "Scotts Turf Builder",
  applicationRate: "3 lbs/1000 sq ft",
  spreaderSetting: null,
  taskMode: null,
  productSearchQuery: null,
};

afterEach(cleanup);

describe("TaskList product shopping link", () => {
  it("renders a shopping link when productSearchQuery is set", () => {
    const task = { ...baseTask, productSearchQuery: "Scotts Turf Builder 32lb" };
    render(<TaskList tasks={[task]} />);
    const link = screen.getByRole("link", { name: /shop/i });
    expect(link).toHaveAttribute(
      "href",
      "https://www.google.com/search?tbm=shop&q=Scotts%20Turf%20Builder%2032lb"
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not render a shopping link when productSearchQuery is null", () => {
    render(<TaskList tasks={[baseTask]} />);
    expect(screen.queryByRole("link", { name: /shop/i })).toBeNull();
  });
});
