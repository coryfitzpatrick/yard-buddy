import { describe, it, expect } from "vitest";
import { buildCostReportEmail } from "@/lib/email";
import type { CostReport } from "@/lib/cost-report";

const fixture: CostReport = {
  month: "2026-05",
  rows: [
    {
      userId: "u1", email: "alice@example.com", plan: "home_plus",
      calls: 127, costUsd: 14.21, revenueUsd: 9.99, marginUsd: -4.22, marginPct: -0.4224,
    },
    {
      userId: "u2", email: "bob@example.com", plan: "home_basic",
      calls: 48, costUsd: 2.89, revenueUsd: 4.99, marginUsd: 2.10, marginPct: 0.4208,
    },
  ],
  totals: { costUsd: 17.10, revenueUsd: 14.98, netUsd: -2.12, usersUnderwater: 1 },
};

describe("buildCostReportEmail", () => {
  it("returns a subject naming the month", () => {
    const { subject } = buildCostReportEmail(fixture);
    expect(subject).toContain("2026-05");
    expect(subject.toLowerCase()).toContain("cost");
  });

  it("includes totals and each row's email + margin in the HTML", () => {
    const { html } = buildCostReportEmail(fixture);
    expect(html).toContain("alice@example.com");
    expect(html).toContain("bob@example.com");
    expect(html).toContain("home_plus");
    expect(html).toContain("home_basic");
    // Underwater row marked negative
    expect(html).toMatch(/-\$?4\.22/);
    // Totals block
    expect(html).toMatch(/-\$?2\.12/);
    expect(html).toMatch(/1\s+of\s+2/i); // 1 underwater of 2
  });

  it("renders the empty-events case with a 'no events' line", () => {
    const empty: CostReport = {
      month: "2026-05",
      rows: [],
      totals: { costUsd: 0, revenueUsd: 0, netUsd: 0, usersUnderwater: 0 },
    };
    const { html } = buildCostReportEmail(empty);
    expect(html.toLowerCase()).toContain("no events");
  });
});
