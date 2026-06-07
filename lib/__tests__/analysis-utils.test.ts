import { describe, it, expect } from "vitest";
import { deduplicateRecommendations } from "../analysis-utils";

describe("deduplicateRecommendations", () => {
  it("passes through unique recommendations unchanged", () => {
    const recs = [
      { title: "Core Aeration", priority: "high" },
      { title: "Overseeding", priority: "medium" },
    ];
    expect(deduplicateRecommendations(recs)).toHaveLength(2);
  });

  it("removes exact duplicate titles", () => {
    const recs = [
      { title: "Core Aeration" },
      { title: "Core Aeration" },
    ];
    expect(deduplicateRecommendations(recs)).toHaveLength(1);
  });

  it("deduplicates when first 3 words match, ignoring extra words", () => {
    const recs = [
      { title: "Core Aeration Service Needed Now" },
      { title: "Core Aeration Service for Better Drainage" },
    ];
    const result = deduplicateRecommendations(recs);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Core Aeration Service Needed Now");
  });

  it("does NOT deduplicate when only first 2 words match but 3rd differs", () => {
    const recs = [
      { title: "Core Aeration for Compacted Soil" },
      { title: "Core Aeration to Improve Drainage" },
    ];
    expect(deduplicateRecommendations(recs)).toHaveLength(2);
  });

  it("deduplication is case-insensitive", () => {
    const recs = [
      { title: "core aeration" },
      { title: "Core Aeration" },
    ];
    expect(deduplicateRecommendations(recs)).toHaveLength(1);
  });

  it("deduplication strips punctuation", () => {
    const recs = [
      { title: "Core Aeration!" },
      { title: "Core Aeration" },
    ];
    expect(deduplicateRecommendations(recs)).toHaveLength(1);
  });

  it("preserves first occurrence when deduplicating", () => {
    const recs = [
      { title: "Dethatching Service Needed", priority: "urgent" },
      { title: "Dethatching to Remove Buildup", priority: "low" },
    ];
    const result = deduplicateRecommendations(recs);
    expect(result[0].priority).toBe("urgent");
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateRecommendations([])).toEqual([]);
  });

  it("allows similar-sounding but different first-3-word titles", () => {
    const recs = [
      { title: "Core Aeration Now" },
      { title: "Lawn Aeration Service" },
    ];
    expect(deduplicateRecommendations(recs)).toHaveLength(2);
  });
});
