"use client";
import { useEffect, useState } from "react";
import { isMobileAppClient } from "@/lib/platform";

const PROMPT_KEY = "biometric_optin_prompted_v1";

export default function BiometricOptInPrompt({ userIsAuthed }: { userIsAuthed: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isMobileAppClient() || !userIsAuthed) return;
    (async () => {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: PROMPT_KEY });
      if (value === "shown") return;
      const { getBiometricStore } = await import("@/lib/biometric/store");
      const store = await getBiometricStore();
      if (!(await store.isAvailable())) {
        await Preferences.set({ key: PROMPT_KEY, value: "shown" });
        return;
      }
      setShow(true);
    })();
  }, [userIsAuthed]);

  async function handleEnable() {
    const { Preferences } = await import("@capacitor/preferences");
    const { Capacitor } = await import("@capacitor/core");

    // Device fingerprint for the server-side audit trail; informational only,
    // not used as an identity check (UA strings change with OS updates).
    const fingerprint = `${Capacitor.getPlatform()}:${navigator.userAgent.slice(0, 100)}`;

    // POST to /api/auth/biometric-issue to get a fresh refresh token. If the
    // server rejects (network/server error), leave PROMPT_KEY unset so the
    // user re-encounters the prompt next launch.
    let issuedToken: string | null = null;
    try {
      const res = await fetch("/api/auth/biometric-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceFingerprint: fingerprint }),
      });
      if (res.ok) {
        const body = await res.json();
        issuedToken = body.token;
      }
    } catch {
      /* swallowed */
    }

    if (!issuedToken) {
      console.warn("BiometricOptInPrompt: biometric-issue request failed");
      setShow(false);
      return;
    }

    const { getBiometricStore } = await import("@/lib/biometric/store");
    const store = await getBiometricStore();
    try {
      await store.storeRefreshToken(issuedToken);
      await Preferences.set({ key: PROMPT_KEY, value: "shown" });
      await Preferences.set({ key: "biometric_enabled", value: "true" });
    } catch (err) {
      console.warn("BiometricOptInPrompt: Keychain write failed", err);
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
      <h3 className="text-base font-semibold">Sign in faster next time?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Use Face ID, Touch ID, or your fingerprint to unlock Yard Analyzer without re-entering your password.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={handleEnable} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Enable
        </button>
        <button onClick={handleLater} className="rounded border px-3 py-1.5 text-sm">
          Not Now
        </button>
      </div>
    </div>
  );
}
