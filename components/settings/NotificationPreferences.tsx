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
  { value: "2", label: "2 days before" },
  { value: "3", label: "3 days before" },
];

const GDD_REMINDER_OPTIONS = [
  { value: "0", label: "On the best day" },
  { value: "1", label: "1 day before" },
  { value: "2", label: "2 days before" },
  { value: "3", label: "3 days before" },
  { value: "7", label: "1 week before" },
];

interface Props {
  initialEnabled: boolean;
  initialDaysAhead: number;
  initialReminderEnabled: boolean;
  initialReminderDaysBefore: number;
  initialGddEnabled: boolean;
  initialGddBestDayReminderDays: number;
}

export function NotificationPreferences({
  initialEnabled,
  initialDaysAhead,
  initialReminderEnabled,
  initialReminderDaysBefore,
  initialGddEnabled,
  initialGddBestDayReminderDays,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [daysAhead, setDaysAhead] = useState(String(initialDaysAhead));
  const [reminderEnabled, setReminderEnabled] = useState(initialReminderEnabled);
  const [reminderDaysBefore, setReminderDaysBefore] = useState(String(initialReminderDaysBefore));
  const [gddEnabled, setGddEnabled] = useState(initialGddEnabled);
  const [gddBestDayReminderDays, setGddBestDayReminderDays] = useState(String(initialGddBestDayReminderDays));
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
          gddNotificationsEnabled: gddEnabled,
          gddBestDayReminderDays: Number(gddBestDayReminderDays),
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
            <SelectTrigger className="w-48" disabled={saving}>
              <SelectValue>{DAYS_OPTIONS.find((o) => o.value === daysAhead)?.label}</SelectValue>
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
            <SelectTrigger className="w-48" disabled={saving}>
              <SelectValue>{REMINDER_DAYS_OPTIONS.find((o) => o.value === reminderDaysBefore)?.label}</SelectValue>
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

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* GDD best-day alerts */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="gdd-toggle" className="text-sm font-medium text-gray-900">
            Best day alerts
          </Label>
          <p className="text-sm text-gray-500 mt-0.5">
            Alert on the best day for time-sensitive treatments like pre-emergent, grub control, or overseeding. We track accumulated warmth from spring, called Growing Degree Days (GDD), to predict when weeds, pests, and grass hit the development stage where each treatment works best.
          </p>
        </div>
        <Switch
          id="gdd-toggle"
          checked={gddEnabled}
          onCheckedChange={setGddEnabled}
        />
      </div>

      {gddEnabled && (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-gray-900">Alert me</Label>
          <Select value={gddBestDayReminderDays} onValueChange={(v) => { if (v != null) setGddBestDayReminderDays(v); }}>
            <SelectTrigger className="w-48" disabled={saving}>
              <SelectValue>{GDD_REMINDER_OPTIONS.find((o) => o.value === gddBestDayReminderDays)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {GDD_REMINDER_OPTIONS.map((opt) => (
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
