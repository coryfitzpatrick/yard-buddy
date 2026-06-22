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
  initialEmailMaster: boolean;
  initialPushMaster: boolean;
  initialTaskEmail: boolean;
  initialTaskPush: boolean;
  initialNotifyDaysAhead: number;
  initialScheduleEmail: boolean;
  initialSchedulePush: boolean;
  initialReminderDaysBefore: number;
  initialWeatherEmail: boolean;
  initialWeatherPush: boolean;
  initialGddPush: boolean;
  initialGddBestDayReminderDays: number;
}

export function NotificationPreferences({
  initialEmailMaster,
  initialPushMaster,
  initialTaskEmail,
  initialTaskPush,
  initialNotifyDaysAhead,
  initialScheduleEmail,
  initialSchedulePush,
  initialReminderDaysBefore,
  initialWeatherEmail,
  initialWeatherPush,
  initialGddPush,
  initialGddBestDayReminderDays,
}: Props) {
  const [emailMaster, setEmailMaster] = useState(initialEmailMaster);
  const [pushMaster, setPushMaster] = useState(initialPushMaster);
  const [taskEmail, setTaskEmail] = useState(initialTaskEmail);
  const [taskPush, setTaskPush] = useState(initialTaskPush);
  const [notifyDaysAhead, setNotifyDaysAhead] = useState(String(initialNotifyDaysAhead));
  const [scheduleEmail, setScheduleEmail] = useState(initialScheduleEmail);
  const [schedulePush, setSchedulePush] = useState(initialSchedulePush);
  const [reminderDaysBefore, setReminderDaysBefore] = useState(String(initialReminderDaysBefore));
  const [weatherEmail, setWeatherEmail] = useState(initialWeatherEmail);
  const [weatherPush, setWeatherPush] = useState(initialWeatherPush);
  const [gddPush, setGddPush] = useState(initialGddPush);
  const [gddBestDay, setGddBestDay] = useState(String(initialGddBestDayReminderDays));
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
          emailNotificationsEnabled: emailMaster,
          pushNotificationsEnabled: pushMaster,
          notificationsEnabled: taskEmail,
          taskPushEnabled: taskPush,
          notifyDaysAhead: Number(notifyDaysAhead),
          reminderNotificationsEnabled: scheduleEmail,
          schedulePushEnabled: schedulePush,
          reminderDaysBefore: Number(reminderDaysBefore),
          weatherEmailEnabled: weatherEmail,
          weatherPushEnabled: weatherPush,
          gddNotificationsEnabled: gddPush,
          gddBestDayReminderDays: Number(gddBestDay),
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
      {/* Master toggles */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Pause all notifications
        </p>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="email-master-toggle" className="text-sm font-medium text-gray-900">
              All email
            </Label>
            <p className="text-sm text-gray-500 mt-0.5">
              Pause every email notification at once.
            </p>
          </div>
          <Switch
            id="email-master-toggle"
            checked={emailMaster}
            onCheckedChange={setEmailMaster}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="push-master-toggle" className="text-sm font-medium text-gray-900">
              All push
            </Label>
            <p className="text-sm text-gray-500 mt-0.5">
              Pause every push notification at once.
            </p>
          </div>
          <Switch
            id="push-master-toggle"
            checked={pushMaster}
            onCheckedChange={setPushMaster}
          />
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Task reminders */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Task reminders
        </p>
        <p className="text-sm text-gray-500">
          Get notified when scheduled tasks are coming up or overdue.
        </p>

        <div className="flex items-center justify-between">
          <Label htmlFor="task-email-toggle" className="text-sm font-medium text-gray-900">
            Email digest
          </Label>
          <Switch
            id="task-email-toggle"
            checked={taskEmail}
            onCheckedChange={setTaskEmail}
            disabled={!emailMaster}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="task-push-toggle" className="text-sm font-medium text-gray-900">
            Push
          </Label>
          <Switch
            id="task-push-toggle"
            checked={taskPush}
            onCheckedChange={setTaskPush}
            disabled={!pushMaster}
          />
        </div>

        {taskEmail && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-sm font-medium text-gray-900">Look ahead</Label>
            <p className="text-sm text-gray-500">
              How far in advance to include upcoming tasks in your digest.
            </p>
            <Select value={notifyDaysAhead} onValueChange={(v) => { if (v != null) setNotifyDaysAhead(v); }}>
              <SelectTrigger className="w-48" disabled={saving}>
                <SelectValue>{DAYS_OPTIONS.find((o) => o.value === notifyDaysAhead)?.label}</SelectValue>
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
      </div>

      <div className="border-t border-gray-100" />

      {/* Schedule reminders */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Schedule reminders
        </p>
        <p className="text-sm text-gray-500">
          Reminders for your mowing and watering schedule.
        </p>

        <div className="flex items-center justify-between">
          <Label htmlFor="schedule-email-toggle" className="text-sm font-medium text-gray-900">
            Email digest
          </Label>
          <Switch
            id="schedule-email-toggle"
            checked={scheduleEmail}
            onCheckedChange={setScheduleEmail}
            disabled={!emailMaster}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="schedule-push-toggle" className="text-sm font-medium text-gray-900">
            Push
          </Label>
          <Switch
            id="schedule-push-toggle"
            checked={schedulePush}
            onCheckedChange={setSchedulePush}
            disabled={!pushMaster}
          />
        </div>

        {scheduleEmail && (
          <div className="space-y-1.5 pt-1">
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
      </div>

      <div className="border-t border-gray-100" />

      {/* Weather alerts */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Weather alerts
        </p>
        <p className="text-sm text-gray-500">
          Alerts when upcoming weather may affect your yard care plans.
        </p>

        <div className="flex items-center justify-between">
          <Label htmlFor="weather-email-toggle" className="text-sm font-medium text-gray-900">
            Email digest
          </Label>
          <Switch
            id="weather-email-toggle"
            checked={weatherEmail}
            onCheckedChange={setWeatherEmail}
            disabled={!emailMaster}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="weather-push-toggle" className="text-sm font-medium text-gray-900">
            Push
          </Label>
          <Switch
            id="weather-push-toggle"
            checked={weatherPush}
            onCheckedChange={setWeatherPush}
            disabled={!pushMaster}
          />
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Best day alerts (GDD) */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Best day alerts (GDD)
        </p>
        <p className="text-sm text-gray-500">
          Alert on the best day for time-sensitive treatments like pre-emergent, grub control, or overseeding. We track accumulated warmth from spring, called Growing Degree Days (GDD), to predict when weeds, pests, and grass hit the development stage where each treatment works best.
        </p>

        <div className="flex items-center justify-between">
          <Label htmlFor="gdd-push-toggle" className="text-sm font-medium text-gray-900">
            Push
          </Label>
          <Switch
            id="gdd-push-toggle"
            checked={gddPush}
            onCheckedChange={setGddPush}
            disabled={!pushMaster}
          />
        </div>

        {gddPush && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-sm font-medium text-gray-900">Alert me</Label>
            <Select value={gddBestDay} onValueChange={(v) => { if (v != null) setGddBestDay(v); }}>
              <SelectTrigger className="w-48" disabled={saving}>
                <SelectValue>{GDD_REMINDER_OPTIONS.find((o) => o.value === gddBestDay)?.label}</SelectValue>
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
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        onClick={save}
        disabled={saving}
        className="bg-green-600 hover:bg-green-700"
      >
        {saving ? "Saving..." : saved ? "Saved!" : "Save preferences"}
      </Button>
    </div>
  );
}
