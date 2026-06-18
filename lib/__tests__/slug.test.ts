import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("My Front Yard")).toBe("my-front-yard");
  });

  it("trims whitespace", () => {
    expect(slugify("  My Yard  ")).toBe("my-yard");
  });

  it("collapses runs of non-alphanumerics into a single hyphen", () => {
    expect(slugify("Back___Yard!!!Garden")).toBe("back-yard-garden");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("---hello---world---")).toBe("hello-world");
  });

  it("strips diacritics-adjacent characters into hyphens", () => {
    expect(slugify("Café & Garden")).toBe("caf-garden");
  });

  it("returns an empty string for input with no alphanumeric characters", () => {
    expect(slugify("!!!---")).toBe("");
  });

  it("keeps digits in the slug", () => {
    expect(slugify("Yard 1")).toBe("yard-1");
  });
});

describe("uniqueSlug", () => {
  it("returns the slugified base when it isn't taken", () => {
    expect(uniqueSlug("Front Yard", [])).toBe("front-yard");
  });

  it("appends -1 when the base is taken", () => {
    expect(uniqueSlug("Front Yard", ["front-yard"])).toBe("front-yard-1");
  });

  it("increments past consecutive collisions", () => {
    expect(uniqueSlug("Front Yard", ["front-yard", "front-yard-1", "front-yard-2"])).toBe(
      "front-yard-3",
    );
  });

  it("falls back to 'section' when slugify yields an empty string", () => {
    expect(uniqueSlug("!!!", [])).toBe("section");
  });

  it("appends a counter to the 'section' fallback too", () => {
    expect(uniqueSlug("!!!", ["section"])).toBe("section-1");
  });

  it("only considers exact matches in existingSlugs", () => {
    // "front-yard-extra" should not block "front-yard"
    expect(uniqueSlug("Front Yard", ["front-yard-extra"])).toBe("front-yard");
  });
});
