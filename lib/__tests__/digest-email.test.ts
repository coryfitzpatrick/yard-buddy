import { describe, it, expect } from "vitest";
import { buildDigestEmail } from "../email";

const BASE_OPTS = {
  userName: "Alex",
  overdueTasks: [],
  upcomingTasks: [],
  scheduledReminders: [],
  weatherAlerts: [],
  dashboardUrl: "https://example.com/dashboard",
  unsubscribeUrl: "https://example.com/unsub",
};

describe("buildDigestEmail with scheduledReminders", () => {
  it("includes Today's Schedule section when reminders present", () => {
    const { html } = buildDigestEmail({
      ...BASE_OPTS,
      scheduledReminders: [
        { sectionName: "Front Yard", yardName: "Home", mowing: { time: "10:00", inches: 3.5 }, watering: null },
      ],
    });
    expect(html).toContain("Today&#x27;s Schedule");
    expect(html).toContain("Front Yard");
    expect(html).toContain("Mow");
    expect(html).toContain("3.5 in");
  });

  it("shows watering with minutes label", () => {
    const { html } = buildDigestEmail({
      ...BASE_OPTS,
      scheduledReminders: [
        { sectionName: "Back Yard", yardName: "Home", mowing: null, watering: { time: "07:00", minutes: 20 } },
      ],
    });
    expect(html).toContain("Water");
    expect(html).toContain("20 min");
  });

  it("omits Today's Schedule section when no reminders", () => {
    const { html } = buildDigestEmail({ ...BASE_OPTS, scheduledReminders: [] });
    expect(html).not.toContain("Today&#x27;s Schedule");
  });

  it("subject mentions reminder when no tasks but reminders present", () => {
    const { subject } = buildDigestEmail({
      ...BASE_OPTS,
      scheduledReminders: [
        { sectionName: "Front", yardName: "Home", mowing: { time: "09:00", inches: 3 }, watering: null },
      ],
    });
    expect(subject).toContain("reminder");
  });

  it("shows Best day line when bestDay is set on upcoming task", () => {
    const { html } = buildDigestEmail({
      ...BASE_OPTS,
      upcomingTasks: [
        {
          title: "Apply pre-emergent herbicide",
          sectionName: "Front Yard",
          scheduledStart: new Date("2026-06-10"),
          scheduledEnd: new Date("2026-06-17"),
          bestDay: new Date("2026-06-14T00:00:00.000Z"),
        },
      ],
    });
    expect(html).toContain("Best day:");
    expect(html).toContain("Jun 14");
  });

  it("omits Best day line when bestDay is null", () => {
    const { html } = buildDigestEmail({
      ...BASE_OPTS,
      upcomingTasks: [
        {
          title: "Apply fertilizer",
          sectionName: "Front Yard",
          scheduledStart: new Date("2026-06-10"),
          scheduledEnd: new Date("2026-06-17"),
          bestDay: null,
        },
      ],
    });
    expect(html).not.toContain("Best day:");
  });
});

describe("buildDigestEmail with weatherAlerts", () => {
  it("omits weather alerts section when no alerts", () => {
    const { html } = buildDigestEmail({ ...BASE_OPTS, weatherAlerts: [] });
    expect(html).not.toContain("Weather alerts");
  });

  it("renders weather alerts section when alerts are present", () => {
    const { html } = buildDigestEmail({
      ...BASE_OPTS,
      weatherAlerts: [
        { yardName: "Home", date: "Wednesday, June 24", kind: "watering", reason: "Rain expected (70%)" },
      ],
    });
    expect(html).toContain("Weather alerts");
    expect(html).toContain("Home");
    expect(html).toContain("watering");
    expect(html).toContain("Wednesday, June 24");
    expect(html).toContain("Rain expected (70%)");
  });
});
