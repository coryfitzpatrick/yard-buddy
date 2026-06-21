"use client";
import { useEffect, useState } from "react";
import { isMobileAppClient } from "@/lib/platform";

// TODO: once Settings → Notifications hookup lands (planned for the biometric/
// settings work in Group 5+), expose an "Enable push notifications" toggle that
// resets PROMPT_KEY and re-runs the permission flow. Currently if a user taps
// "Not Now" or denies at the OS prompt, they have no in-app path to opt back
// in, they have to go to OS settings and re-allow.
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
    const { Capacitor } = await import("@capacitor/core");

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      // User denied at OS level. Respect it; set the preference to avoid re-prompting.
      await Preferences.set({ key: PROMPT_KEY, value: "shown" });
      setShow(false);
      return;
    }

    // M-2: defensive platform guard. If somehow we're running on a non-mobile
    // platform (web, electron, etc.), bail rather than mis-registering.
    const platform = Capacitor.getPlatform();
    if (platform !== "ios" && platform !== "android") {
      console.warn("PushPermissionPrompt: unsupported platform", platform);
      setShow(false);
      return;
    }

    // I-4: race the registration listener against a 30s timeout. If the listener
    // never fires (FCM/APNs hung, corporate firewall, cert issue, etc.) we
    // leave PROMPT_KEY unset so the user re-encounters the prompt next launch.
    // Without this, a silent registration failure would result in the user
    // believing notifications are enabled forever but never receiving any.
    const registered = await new Promise<boolean>((resolve) => {
      let settled = false;
      let off: { remove: () => void } | null = null;
      const cleanup = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      };
      const timeoutId = setTimeout(() => {
        console.warn("PushPermissionPrompt: registration listener timed out after 30s");
        off?.remove();
        cleanup(false);
      }, 30_000);
      PushNotifications.addListener("registration", async (t) => {
        off?.remove();
        // I-5: retry the register POST so a transient network failure doesn't
        // leave us with an FCM token nobody can deliver to. After 2 attempts,
        // surface the failure by NOT setting PROMPT_KEY so we retry on next mount.
        let ok = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch("/api/devices/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: t.value, platform }),
            });
            if (res.ok) {
              ok = true;
              break;
            }
          } catch (err) {
            console.warn(
              "PushPermissionPrompt: register POST failed (attempt",
              attempt + 1,
              ")",
              err,
            );
          }
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
        }
        cleanup(ok);
      }).then((handle) => {
        off = handle;
      });
      PushNotifications.register();
    });

    if (registered) {
      await Preferences.set({ key: PROMPT_KEY, value: "shown" });
    }
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
