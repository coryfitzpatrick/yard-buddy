"use client";
import { useEffect, useState } from "react";
import { isMobileAppClient } from "@/lib/platform";

const PROMPT_KEY = "push_permission_prompted_v1";

export default function PushPermissionPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isMobileAppClient()) return;
    (async () => {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: PROMPT_KEY });
      if (value === "shown") return;
      setShow(true);
    })();
  }, []);

  async function handleEnable() {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { Preferences } = await import("@capacitor/preferences");

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") {
      // Listen ONCE for the token, then register
      const off = await PushNotifications.addListener("registration", async (t) => {
        const { Capacitor } = await import("@capacitor/core");
        const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
        await fetch("/api/devices/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t.value, platform }),
        });
        off.remove();
      });
      await PushNotifications.register();
    }
    await Preferences.set({ key: PROMPT_KEY, value: "shown" });
    setShow(false);
  }

  async function handleLater() {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: PROMPT_KEY, value: "shown" });
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 mx-auto max-w-sm rounded-lg border bg-background p-4 shadow-lg">
      <h3 className="text-base font-semibold">Enable lawn care reminders?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Yard Analyzer can remind you about time-sensitive moments (best days for pre-emergent, weather warnings before scheduled work).
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={handleEnable} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Enable Notifications
        </button>
        <button onClick={handleLater} className="rounded border px-3 py-1.5 text-sm">
          Maybe Later
        </button>
      </div>
    </div>
  );
}
