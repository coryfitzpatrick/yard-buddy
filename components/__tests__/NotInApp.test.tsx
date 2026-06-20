// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import NotInApp from "@/components/NotInApp";

describe("NotInApp", () => {
  it("renders children in a browser context", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Safari" });
    const { getByText } = render(<NotInApp><span>visible</span></NotInApp>);
    expect(getByText("visible")).toBeDefined();
    vi.unstubAllGlobals();
  });

  it("renders nothing in the mobile app context", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 YardAnalyzerApp/1.0" });
    const { queryByText } = render(<NotInApp><span>hidden</span></NotInApp>);
    expect(queryByText("hidden")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("renders null on initial paint before effects run (SSR-safe contract)", () => {
    // renderToStaticMarkup never runs effects, so it captures the pre-mount state.
    // This pins the hydration-safe contract; useState(true) initial value would
    // break this test.
    const html = renderToStaticMarkup(<NotInApp><span>x</span></NotInApp>);
    expect(html).toBe("");
  });
});
