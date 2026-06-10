import { describe, it, expect } from "vitest";
import { validateLawnImages } from "../claude";

describe("validateLawnImages", () => {
  it("is exported from lib/claude", () => {
    expect(typeof validateLawnImages).toBe("function");
  });
});
