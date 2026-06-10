# Schedule Reminder Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a daily email digest that includes today's mowing/watering schedule reminders (distinct from AI task reminders), with per-user settings to toggle and configure how early the reminder arrives.

**Architecture:** Add two new User fields (`reminderNotificationsEnabled`, `reminderDaysBefore`) to control reminder delivery. A new pure helper `lib/cron/reminder-scheduler.ts` parses section schedule JSON and returns today's matching reminders. The existing daily cron combines tasks + schedule reminders into one email per user; users with only reminders enabled (no task notifications) are now also processed. The email template gains a blue "Today's Schedule" section visually distinct from the green task sections.

**Tech Stack:** Prisma (schema + migration), Zod (validation), Resend (email), Vitest (tests), Next.js API routes, React (settings UI)

---

## File Structure

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `reminderNotificationsEnabled`, `reminderDaysBefore` to User model |
| `lib/cron/reminder-scheduler.ts` | **Create** — pure function: given sections + target date, returns today's schedule reminders |
| `lib/__tests__/reminder-scheduler.test.ts` | **Create** — unit tests for reminder-scheduler |
| `lib/validations/notifications.ts` | Add new fields to schema |
| `lib/email.ts` | Add `scheduledReminders` param to `buildDigestEmail`; update subject line logic |
| `lib/__tests__/digest-email.test.ts` | **Create** — unit tests for email with reminders section |
| `app/api/user/notifications/route.ts` | Save new fields |
| `app/api/cron/daily/route.ts` | Query reminder users, call `getTodayReminders`, combine into email send |
| `components/settings/NotificationPreferences.tsx` | Add reminder prefs sub-section (toggle + days-before dropdown) |
| `app/(dashboard)/settings/page.tsx` | Fetch + pass new fields to component |

---

### Task 1: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to User model**

In `prisma/schema.prisma`, add two lines after `notifyDaysAhead`:

```prisma
model User {
  id                      String    @id @default(cuid())
  name                    String?
  email                   String    @unique
  emailVerified           DateTime?
  image                   String?
  passwordHash            String?
  notificationsEnabled    Boolean   @default(true)
  lastNotifiedAt          DateTime?
  notifyDaysAhead         Int       @default(3)
  reminderNotificationsEnabled Boolean @default(true)
  reminderDaysBefore      Int       @default(0)
  weatherWidgetCollapsed  Boolean   @default(false)
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  accounts                Account[]
  sessions                Session[]
  yards                   Yard[]
  passwordResets          PasswordResetToken[]
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_reminder_notification_prefs
```

Expected output ends with: `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add reminderNotificationsEnabled and reminderDaysBefore to User"
```

---

### Task 2: Reminder scheduler helper

**Files:**
- Create: `lib/cron/reminder-scheduler.ts`
- Create: `lib/__tests__/reminder-scheduler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/reminder-scheduler.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getTodayReminders } from "../cron/reminder-scheduler";

const MON = new Date("2026-06-08T00:00:00Z"); // Monday
const TUE = new Date("2026-06-09T00:00:00Z"); // Tuesday
const WED = new Date("2026-06-10T00:00:00Z"); // Wednesday

const mowMon = JSON.stringify({ days: ["Mon"], time: "10:00", inches: "3.5" });
const waterMonWedFri = JSON.stringify({ days: ["Mon", "Wed", "Fri"], time: "07:00", inches: "20" });

describe("getTodayReminders", () => {
  it("returns empty array when no sections match today", () => {
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: mowMon, wateringSchedule: null }];
    expect(getTodayReminders(sections, TUE, 0)).toEqual([]);
  });

  it("returns mowing reminder when day matches", () => {
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: mowMon, wateringSchedule: null }];
    const result = getTodayReminders(sections, MON, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sectionName: "Front",
      yardName: "Home",
      mowing: { time: "10:00", inches: "3.5" },
      watering: null,
    });
  });

  it("returns watering reminder when day matches", () => {
    const sections = [{ name: "Back", yardName: "Home", mowingSchedule: null, wateringSchedule: waterMonWedFri }];
    const result = getTodayReminders(sections, WED, 0);
    expect(result).toHaveLength(1);
    expect(result[0].watering).toMatchObject({ time: "07:00", minutes: "20" });
    expect(result[0].mowing).toBeNull();
  });

  it("returns both mowing and watering when both match", () => {
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: mowMon, wateringSchedule: waterMonWedFri }];
    const result = getTodayReminders(sections, MON, 0);
    expect(result[0].mowing).not.toBeNull();
    expect(result[0].watering).not.toBeNull();
  });

  it("handles daysBefore=1 by checking tomorrow's day", () => {
    // daysBefore=1 means: today is Sunday, check Monday's schedule
    const sun = new Date("2026-06-07T00:00:00Z"); // Sunday
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: mowMon, wateringSchedule: null }];
    const result = getTodayReminders(sections, sun, 1);
    expect(result).toHaveLength(1);
  });

  it("skips sections with unparseable schedule JSON", () => {
    const sections = [{ name: "Front", yardName: "Home", mowingSchedule: "not json", wateringSchedule: null }];
    expect(getTodayReminders(sections, MON, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/reminder-scheduler.test.ts
```

Expected: FAIL — `Cannot find module '../cron/reminder-scheduler'`

- [ ] **Step 3: Create the implementation**

Create `lib/cron/reminder-scheduler.ts`:

```typescript
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ScheduledReminder {
  sectionName: string;
  yardName: string;
  mowing: { time: string; inches: string } | null;
  watering: { time: string; minutes: string } | null;
}

export function getTodayReminders(
  sections: Array<{
    name: string;
    yardName: string;
    mowingSchedule: string | null;
    wateringSchedule: string | null;
  }>,
  today: Date,
  daysBefore: number
): ScheduledReminder[] {
  const checkDate = new Date(today);
  checkDate.setUTCDate(checkDate.getUTCDate() + daysBefore);
  const dayAbbr = DAY_NAMES[checkDate.getUTCDay()];

  const reminders: ScheduledReminder[] = [];

  for (const section of sections) {
    let mowing: ScheduledReminder["mowing"] = null;
    let watering: ScheduledReminder["watering"] = null;

    if (section.mowingSchedule) {
      try {
        const p = JSON.parse(section.mowingSchedule);
        if (Array.isArray(p.days) && p.days.includes(dayAbbr)) {
          mowing = { time: p.time ?? "", inches: p.inches ?? "" };
        }
      } catch { /* skip unparseable */ }
    }

    if (section.wateringSchedule) {
      try {
        const p = JSON.parse(section.wateringSchedule);
        if (Array.isArray(p.days) && p.days.includes(dayAbbr)) {
          watering = { time: p.time ?? "", minutes: p.inches ?? "" };
        }
      } catch { /* skip unparseable */ }
    }

    if (mowing || watering) {
      reminders.push({ sectionName: section.name, yardName: section.yardName, mowing, watering });
    }
  }

  return reminders;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/reminder-scheduler.test.ts
```

Expected: 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/cron/reminder-scheduler.ts lib/__tests__/reminder-scheduler.test.ts
git commit -m "feat: add getTodayReminders helper for schedule-based reminders"
```

---

### Task 3: Email template — "Today's Schedule" section

**Files:**
- Modify: `lib/email.ts`
- Create: `lib/__tests__/digest-email.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/digest-email.test.ts`:

```typescript
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

  it("subject mentions reminders when no tasks but reminders present", () => {
    const { subject } = buildDigestEmail({
      ...BASE_OPTS,
      scheduledReminders: [
        { sectionName: "Front", yardName: "Home", mowing: { time: "09:00", inches: "3" }, watering: null },
      ],
    });
    expect(subject).toContain("reminder");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/digest-email.test.ts
```

Expected: FAIL — `buildDigestEmail` does not accept `scheduledReminders`

- [ ] **Step 3: Update `buildDigestEmail` in `lib/email.ts`**

Add the `ScheduledReminder` import and update the function signature and body. Replace the entire `buildDigestEmail` function (lines 57–123):

```typescript
import type { ScheduledReminder } from "@/lib/cron/reminder-scheduler";

function formatDisplayTime(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function buildDigestEmail(opts: {
  userName: string;
  overdueTasks: DigestTask[];
  upcomingTasks: DigestTask[];
  scheduledReminders: ScheduledReminder[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const { userName, overdueTasks, upcomingTasks, scheduledReminders, dashboardUrl, unsubscribeUrl } = opts;

  const subject =
    overdueTasks.length > 0
      ? `You have ${overdueTasks.length} overdue lawn task${overdueTasks.length > 1 ? "s" : ""} still worth doing`
      : upcomingTasks.length > 0
      ? "Upcoming lawn tasks for the next few days"
      : "Today's lawn care reminder";

  const overdueHtml =
    overdueTasks.length > 0
      ? `<h2 style="color:#dc2626;font-size:16px;margin:24px 0 8px;">Overdue - Still Worth Doing</h2>
        ${overdueTasks
          .map(
            (t) => `<div style="border:1px solid #fee2e2;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fafafa;">
            <div style="font-weight:600;color:#111;">${escapeHtml(t.title)}</div>
            ${t.overdueNote ? `<div style="color:#6b7280;font-size:14px;margin-top:4px;">${escapeHtml(t.overdueNote)}</div>` : ""}
            <div style="color:#9ca3af;font-size:12px;margin-top:4px;">${escapeHtml(t.sectionName)}</div>
          </div>`
          )
          .join("")}`
      : "";

  const upcomingHtml =
    upcomingTasks.length > 0
      ? `<h2 style="color:#16a34a;font-size:16px;margin:24px 0 8px;">Coming Up Soon</h2>
        ${upcomingTasks
          .map((t) => {
            const dateLabel =
              t.scheduledStart && t.scheduledEnd
                ? formatDateRange(t.scheduledStart, t.scheduledEnd)
                : "";
            return `<div style="border:1px solid #dcfce7;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#fafafa;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:600;color:#111;">${escapeHtml(t.title)}</div>
                ${dateLabel ? `<div style="color:#16a34a;font-size:12px;font-weight:600;">${dateLabel}</div>` : ""}
              </div>
              <div style="color:#9ca3af;font-size:12px;margin-top:4px;">${escapeHtml(t.sectionName)}</div>
            </div>`;
          })
          .join("")}`
      : "";

  const remindersHtml =
    scheduledReminders.length > 0
      ? `<h2 style="color:#0369a1;font-size:16px;margin:24px 0 8px;">&#128197; Today&#x27;s Schedule</h2>
        ${scheduledReminders
          .map((r) => {
            const lines: string[] = [];
            if (r.mowing) {
              const timeStr = r.mowing.time ? ` at ${formatDisplayTime(r.mowing.time)}` : "";
              const heightStr = r.mowing.inches ? ` &middot; ${r.mowing.inches} in` : "";
              lines.push(`<div style="color:#374151;font-size:14px;">&#x2702;&#xFE0F; Mow${timeStr}${heightStr}</div>`);
            }
            if (r.watering) {
              const timeStr = r.watering.time ? ` at ${formatDisplayTime(r.watering.time)}` : "";
              const minStr = r.watering.minutes ? ` &middot; ${r.watering.minutes} min` : "";
              lines.push(`<div style="color:#374151;font-size:14px;">&#x1F4A7; Water${timeStr}${minStr}</div>`);
            }
            return `<div style="border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#f0f9ff;">
              <div style="font-weight:600;color:#111;margin-bottom:6px;">${escapeHtml(r.sectionName)}</div>
              ${lines.join("")}
            </div>`;
          })
          .join("")}`
      : "";

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Analyzer</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">Here is what needs attention for your lawn:</p>
  ${overdueHtml}
  ${upcomingHtml}
  ${remindersHtml}
  <div style="text-align:center;margin:32px 0;">
    <a href="${dashboardUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View My Tasks</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:32px;">
    <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe from reminders</a>
  </p>
</body>
</html>`;

  return { subject, html };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/__tests__/digest-email.test.ts
```

Expected: 4 tests passing

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing

- [ ] **Step 6: Commit**

```bash
git add lib/email.ts lib/__tests__/digest-email.test.ts
git commit -m "feat: add Today's Schedule section to digest email"
```

---

### Task 4: Validation schema + API route

**Files:**
- Modify: `lib/validations/notifications.ts`
- Modify: `app/api/user/notifications/route.ts`

- [ ] **Step 1: Update the validation schema**

Replace `lib/validations/notifications.ts`:

```typescript
import { z } from "zod";

export const notificationPrefsSchema = z.object({
  notificationsEnabled: z.boolean(),
  notifyDaysAhead: z.number().int().min(1).max(14),
  reminderNotificationsEnabled: z.boolean(),
  reminderDaysBefore: z.number().int().min(0).max(1),
});

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
```

- [ ] **Step 2: Update the API route**

Replace `app/api/user/notifications/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notificationPrefsSchema } from "@/lib/validations/notifications";

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = notificationPrefsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      notificationsEnabled: parsed.data.notificationsEnabled,
      notifyDaysAhead: parsed.data.notifyDaysAhead,
      reminderNotificationsEnabled: parsed.data.reminderNotificationsEnabled,
      reminderDaysBefore: parsed.data.reminderDaysBefore,
    },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing

- [ ] **Step 4: Commit**

```bash
git add lib/validations/notifications.ts app/api/user/notifications/route.ts
git commit -m "feat: add reminder prefs fields to notification validation and API route"
```

---

### Task 5: Settings UI

**Files:**
- Modify: `components/settings/NotificationPreferences.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Update `NotificationPreferences.tsx`**

Replace the full file content:

```tsx
"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const DAYS_OPTIONS = [
  { value: "1", label: "1 day before" },
  { value: "2", label: "2 days before" },
  { value: "3", label: "3 days before" },
  { value: "5", label: "5 days before" },
  { value: "7", label: "1 week before" },
  { value: "14", label: "2 weeks before" },
];

const REMINDER_DAYS_OPTIONS = [
  { value: "0", label: "Morning of" },
  { value: "1", label: "1 day before" },
];

interface Props {
  initialEnabled: boolean;
  initialDaysAhead: number;
  initialReminderEnabled: boolean;
  initialReminderDaysBefore: number;
}

export function NotificationPreferences({
  initialEnabled,
  initialDaysAhead,
  initialReminderEnabled,
  initialReminderDaysBefore,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [daysAhead, setDaysAhead] = useState(String(initialDaysAhead));
  const [reminderEnabled, setReminderEnabled] = useState(initialReminderEnabled);
  const [reminderDaysBefore, setReminderDaysBefore] = useState(String(initialReminderDaysBefore));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/user/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationsEnabled: enabled,
          notifyDaysAhead: Number(daysAhead),
          reminderNotificationsEnabled: reminderEnabled,
          reminderDaysBefore: Number(reminderDaysBefore),
        }),
      });
      if (!res.ok) {
        setError("Failed to save. Please try again.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Task notifications */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="notifications-toggle" className="text-sm font-medium text-gray-900">
            Task reminders
          </Label>
          <p className="text-sm text-gray-500 mt-0.5">
            Daily digest when AI-generated tasks are coming up or overdue.
          </p>
        </div>
        <Switch
          id="notifications-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      {enabled && (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-gray-900">Notify me</Label>
          <p className="text-sm text-gray-500">
            How far in advance to include upcoming tasks in your digest.
          </p>
          <Select value={daysAhead} onValueChange={(v) => { if (v != null) setDaysAhead(v); }}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* Schedule reminders */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="reminder-toggle" className="text-sm font-medium text-gray-900">
            Schedule reminders
          </Label>
          <p className="text-sm text-gray-500 mt-0.5">
            Email reminders for your mowing and watering schedule.
          </p>
        </div>
        <Switch
          id="reminder-toggle"
          checked={reminderEnabled}
          onCheckedChange={setReminderEnabled}
        />
      </div>

      {reminderEnabled && (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-gray-900">Send reminder</Label>
          <Select value={reminderDaysBefore} onValueChange={(v) => { if (v != null) setReminderDaysBefore(v); }}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_DAYS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        onClick={save}
        disabled={saving}
        className="bg-green-600 hover:bg-green-700"
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save preferences"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/(dashboard)/settings/page.tsx`**

Replace the select and component usage:

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { Bell, Lock } from "lucide-react";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      notificationsEnabled: true,
      notifyDaysAhead: true,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: true,
      passwordHash: true,
    },
  });

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="max-w-lg space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          </div>
          <NotificationPreferences
            initialEnabled={user.notificationsEnabled}
            initialDaysAhead={user.notifyDaysAhead}
            initialReminderEnabled={user.reminderNotificationsEnabled}
            initialReminderDaysBefore={user.reminderDaysBefore}
          />
        </div>

        {user.passwordHash && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
            </div>
            <ChangePassword />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add components/settings/NotificationPreferences.tsx app/(dashboard)/settings/page.tsx
git commit -m "feat: add schedule reminder prefs to settings UI"
```

---

### Task 6: Wire reminders into the daily cron

**Files:**
- Modify: `app/api/cron/daily/route.ts`

This is the largest change. The cron must now:
1. Also query users who have `reminderNotificationsEnabled=true` and sections with schedules
2. For each unique user to process, collect task content (if `notificationsEnabled`) and reminder content (if `reminderNotificationsEnabled`)
3. Send a combined email if either has content and user hasn't been notified today

- [ ] **Step 1: Replace the full `app/api/cron/daily/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWeatherByZip } from "@/lib/weather";
import { computeNewWindow } from "@/lib/cron/weather-scheduler";
import { assessOverdueTasks } from "@/lib/cron/overdue-assessor";
import { getTodayReminders } from "@/lib/cron/reminder-scheduler";
import { resend, buildDigestEmail, generateUnsubscribeToken } from "@/lib/email";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = startOfToday();

  // 1. Fetch yards with pending tasks (for task processing + notifications)
  const yards = await db.yard.findMany({
    where: {
      sections: { some: { tasks: { some: { status: "pending" } } } },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          notificationsEnabled: true,
          reminderNotificationsEnabled: true,
          reminderDaysBefore: true,
          lastNotifiedAt: true,
          notifyDaysAhead: true,
        },
      },
      sections: {
        include: {
          tasks: {
            where: { status: "pending" },
            select: {
              id: true,
              title: true,
              scheduledStart: true,
              scheduledEnd: true,
              weatherCondition: true,
              stillWorthDoing: true,
            },
          },
        },
      },
    },
  });

  // 2. Fetch users with reminder notifications enabled who have scheduled sections
  // (may overlap with task users — we deduplicate later)
  const reminderUsers = await db.user.findMany({
    where: {
      reminderNotificationsEnabled: true,
      yards: {
        some: {
          sections: {
            some: {
              OR: [
                { mowingSchedule: { not: null } },
                { wateringSchedule: { not: null } },
              ],
            },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      notificationsEnabled: true,
      reminderNotificationsEnabled: true,
      reminderDaysBefore: true,
      lastNotifiedAt: true,
      notifyDaysAhead: true,
      yards: {
        select: {
          name: true,
          sections: {
            where: {
              OR: [
                { mowingSchedule: { not: null } },
                { wateringSchedule: { not: null } },
              ],
            },
            select: {
              name: true,
              mowingSchedule: true,
              wateringSchedule: true,
            },
          },
        },
      },
    },
  });

  // 3. Fetch weather per unique ZIP
  const weatherByZip = new Map<string, Awaited<ReturnType<typeof getWeatherByZip>>>();
  const uniqueZips = [...new Set(yards.map((y) => y.zipCode))];
  await Promise.all(
    uniqueZips.map(async (zip) => {
      try {
        weatherByZip.set(zip, await getWeatherByZip(zip));
      } catch { /* skip unavailable ZIPs */ }
    })
  );

  // 4. Recalculate windows and collect newly overdue tasks
  type YardSections = typeof yards[0]["sections"];
  type SectionTasks = YardSections[0]["tasks"];

  const overdueBySection = new Map<
    string,
    { tasks: SectionTasks; grassType: string; zip: string }
  >();

  for (const yard of yards) {
    const weather = weatherByZip.get(yard.zipCode);
    if (!weather) {
      console.warn(`[cron] No weather data for ZIP ${yard.zipCode}, skipping yard ${yard.id}`);
      continue;
    }

    for (const section of yard.sections) {
      const newlyOverdue: SectionTasks = [];

      for (const task of section.tasks) {
        const condition = task.weatherCondition ?? "any";

        if (task.scheduledEnd && isBefore(task.scheduledEnd, today) && task.stillWorthDoing === null) {
          newlyOverdue.push(task);
          continue;
        }

        const windowDays =
          task.scheduledStart && task.scheduledEnd
            ? Math.max(1, Math.round((task.scheduledEnd.getTime() - task.scheduledStart.getTime()) / 86400000))
            : 7;

        const newWindow = computeNewWindow(condition as import("@/types").WeatherCondition, weather.forecast, windowDays, today);

        if (newWindow) {
          await db.lawnTask.update({
            where: { id: task.id },
            data: { scheduledStart: newWindow.scheduledStart, scheduledEnd: newWindow.scheduledEnd },
          });
        } else if (condition === "any" && task.scheduledEnd && isBefore(task.scheduledEnd, today)) {
          await db.lawnTask.update({
            where: { id: task.id },
            data: { scheduledStart: today, scheduledEnd: addDays(today, windowDays - 1) },
          });
        }
      }

      if (newlyOverdue.length > 0) {
        overdueBySection.set(section.id, {
          tasks: newlyOverdue,
          grassType: section.grassType,
          zip: yard.zipCode,
        });
      }
    }

    await db.yard.update({
      where: { id: yard.id },
      data: { weatherRefreshedAt: new Date() },
    });
  }

  // 5. Assess newly overdue tasks per section
  for (const [, { tasks, grassType, zip }] of overdueBySection) {
    const weather = weatherByZip.get(zip);
    const weatherSummary = weather
      ? `${weather.temp}F, ${weather.description}, ${weather.precipitationChance}% rain`
      : "weather unavailable";

    try {
      const assessments = await assessOverdueTasks(
        tasks
          .filter((t) => t.scheduledEnd !== null)
          .map((t) => ({
            id: t.id,
            title: t.title,
            scheduledEnd: t.scheduledEnd!,
            grassType,
          })),
        weatherSummary
      );

      for (const a of assessments) {
        await db.lawnTask.update({
          where: { id: a.taskId },
          data: { stillWorthDoing: a.stillWorthDoing, overdueNote: a.overdueNote },
        });
      }
    } catch (err) {
      console.error("Overdue assessment failed for section:", err);
    }
  }

  // 6. Send email digests — tasks + schedule reminders combined per user
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // Build a unified map: userId → user data (task users take precedence for task content)
  type TaskUser = typeof yards[0]["user"];
  type ReminderUser = typeof reminderUsers[0];

  const userMap = new Map<string, { taskUser?: TaskUser; reminderUser?: ReminderUser }>();

  for (const yard of yards) {
    const existing = userMap.get(yard.user.id) ?? {};
    userMap.set(yard.user.id, { ...existing, taskUser: yard.user });
  }
  for (const ru of reminderUsers) {
    const existing = userMap.get(ru.id) ?? {};
    userMap.set(ru.id, { ...existing, reminderUser: ru });
  }

  for (const [userId, { taskUser, reminderUser }] of userMap) {
    const user = taskUser ?? reminderUser!;
    if (!user.email) continue;
    if (user.lastNotifiedAt && sameDay(user.lastNotifiedAt, today)) continue;

    // Collect task content
    let overdueTasks: Array<{ title: string; sectionName: string; overdueNote: string | null }> = [];
    let upcomingTasks: Array<{ title: string; sectionName: string; scheduledStart: Date | null; scheduledEnd: Date | null }> = [];

    if (user.notificationsEnabled) {
      const allPendingTasks = await db.lawnTask.findMany({
        where: { yardSection: { yard: { userId } }, status: "pending" },
        include: { yardSection: { select: { name: true } } },
      });

      overdueTasks = allPendingTasks
        .filter((t) => t.stillWorthDoing === true)
        .map((t) => ({ title: t.title, sectionName: t.yardSection?.name ?? "", overdueNote: t.overdueNote }));

      upcomingTasks = allPendingTasks
        .filter((t) => {
          if (!t.scheduledStart || t.stillWorthDoing !== null) return false;
          const daysUntilStart = (t.scheduledStart.getTime() - today.getTime()) / 86400000;
          return daysUntilStart >= 0 && daysUntilStart <= user.notifyDaysAhead;
        })
        .map((t) => ({ title: t.title, sectionName: t.yardSection?.name ?? "", scheduledStart: t.scheduledStart, scheduledEnd: t.scheduledEnd }));
    }

    // Collect reminder content
    let scheduledReminders: Awaited<ReturnType<typeof getTodayReminders>> = [];

    if (user.reminderNotificationsEnabled && reminderUser) {
      const sections = reminderUser.yards.flatMap((y) =>
        y.sections.map((s) => ({ name: s.name, yardName: y.name, mowingSchedule: s.mowingSchedule, wateringSchedule: s.wateringSchedule }))
      );
      scheduledReminders = getTodayReminders(sections, today, user.reminderDaysBefore);
    }

    if (overdueTasks.length === 0 && upcomingTasks.length === 0 && scheduledReminders.length === 0) continue;

    const unsubToken = generateUnsubscribeToken(userId);
    const { subject, html } = buildDigestEmail({
      userName: user.name?.split(" ")[0] ?? "there",
      overdueTasks,
      upcomingTasks,
      scheduledReminders,
      dashboardUrl: `${baseUrl}/dashboard`,
      unsubscribeUrl: `${baseUrl}/api/notifications/unsubscribe?token=${unsubToken}`,
    });

    try {
      await resend.emails.send({
        from: "Yard Analyzer <onboarding@resend.dev>",
        to: user.email,
        subject,
        html,
      });
      await db.user.update({
        where: { id: userId },
        data: { lastNotifiedAt: new Date() },
      });
    } catch (err) {
      console.error("Email send failed for user:", userId, err);
    }
  }

  return NextResponse.json({ ok: true, processed: yards.length });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/daily/route.ts
git commit -m "feat: wire schedule reminders into daily cron email digest"
```

---

## Self-Review

**Spec coverage:**
- ✅ DB fields for reminder toggle + timing preference
- ✅ Settings UI with separate section (toggle + "morning of" / "1 day before")
- ✅ Email template: blue "Today's Schedule" section visually distinct from green task sections
- ✅ Cron processes reminder-only users (no pending tasks but has schedules)
- ✅ Task and reminder emails are combined into one per user per day
- ✅ Validation schema updated; API route saves new fields

**Placeholder scan:** None found.

**Type consistency:** `ScheduledReminder` defined in `lib/cron/reminder-scheduler.ts` and imported in `lib/email.ts` — same type throughout.
