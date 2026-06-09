import { describe, it, expect } from "vitest";
import { buildDigestEmail } from "../email";

const BASE_OPTS = {
  userName: "Alex",
  overdueTasks: [],
  upcomingTasks: [],
  scheduledReminders: [],
  dashboardUrl: "https://example.com/dashboard",
  unsubscribeUrl: "https://example.com/unsub",
};

describe("buildDigestEmail with scheduledReminders", () => {
  it("includes Today's Schedule section when reminders present", () => {
    const { html } = buildDigestEmail({
      ...BASE_OPTS,
      scheduledReminders: [
        { sectionName: "Front Yard", yardName: "Home", mowing: { time: "10:00", inches: "3.5" }, watering: null },
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
        { sectionName: "Back Yard", yardName: "Home", mowing: null, watering: { time: "07:00", minutes: "20" } },
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
        { sectionName: "Front", yardName: "Home", mowing: { time: "09:00", inches: "3" }, watering: null },
      ],
    });
    expect(subject).toContain("reminder");
  });
});
