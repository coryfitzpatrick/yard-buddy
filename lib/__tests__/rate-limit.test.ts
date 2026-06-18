import { describe, it, expect } from "vitest";
import { getClientIp } from "@/lib/rate-limit";

function makeReq(headers: Record<string, string>): Request {
  return new Request("https://example.com/", { headers });
}

describe("getClientIp", () => {
  it("returns 'unknown' when x-forwarded-for is missing", () => {
    expect(getClientIp(makeReq({}))).toBe("unknown");
  });

  it("returns the only value when x-forwarded-for has a single entry", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "203.0.113.5" }))).toBe("203.0.113.5");
  });

  it("returns the left-most (originating) value from a comma-separated chain", () => {
    expect(
      getClientIp(makeReq({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" })),
    ).toBe("203.0.113.5");
  });

  it("trims surrounding whitespace from the parsed value", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "   203.0.113.5   , 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
  });

  it("returns 'unknown' for an empty x-forwarded-for header", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});
