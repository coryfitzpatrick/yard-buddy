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

interface Props {
  initialEnabled: boolean;
  initialDaysAhead: number;
}

export function NotificationPreferences({ initialEnabled, initialDaysAhead }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [daysAhead, setDaysAhead] = useState(String(initialDaysAhead));
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
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="notifications-toggle" className="text-sm font-medium text-gray-900">
            Email reminders
          </Label>
          <p className="text-sm text-gray-500 mt-0.5">
            Receive a daily digest when tasks are coming up or overdue.
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
          <Select value={daysAhead} onValueChange={(v) => { if (v !== null) setDaysAhead(v); }}>
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
