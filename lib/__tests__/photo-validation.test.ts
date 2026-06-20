import { describe, it, expect } from "vitest";

const { validateLawnImages } = await import("../claude");

describe("validateLawnImages", () => {
  it("is exported from lib/claude", () => {
    expect(typeof validateLawnImages).toBe("function");
  });
});
