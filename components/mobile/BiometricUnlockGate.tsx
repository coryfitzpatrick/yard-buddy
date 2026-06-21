"use client";
import { useEffect, useState } from "react";
import { isMobileAppClient } from "@/lib/platform";

export default function BiometricUnlockGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isMobileAppClient()) {
        setReady(true);
        return;
      }
      const { Preferences } = await import("@capacitor/preferences");
      const { value: enabled } = await Preferences.get({ key: "biometric_enabled" });
      if (enabled !== "true") {
        setReady(true);
        return;
      }

      // If the cached session cookie is still valid, no biometric prompt
      // needed; let the normal app shell render.
      try {
        const sessionRes = await fetch("/api/auth/session");
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session?.user) {
            setReady(true);
            return;
          }
        }
      } catch {
        /* fall through to biometric */
      }

      // Session invalid -- prompt biometric, then exchange the refresh token
      // for a fresh session cookie.
      const { getBiometricStore } = await import("@/lib/biometric/store");
      const store = await getBiometricStore();
      const refreshToken = await store.unlockRefreshToken();
      if (!refreshToken) {
        // User cancelled or biometric failed; fall through to login screen.
        setReady(true);
        return;
      }

      try {
        const res = await fetch("/api/auth/biometric-exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: refreshToken }),
        });
        if (res.ok) {
          const body = await res.json();
          // Server set the session cookie; persist the rotated refresh token
          // so the next cold launch still works.
          await store.storeRefreshToken(body.token);
          window.location.reload();
          return;
        }
        // Exchange rejected the token (revoked, expired, etc.). Clear local
        // state so the user goes through the regular login + opt-in flow.
        console.warn("BiometricUnlockGate: exchange failed", res.status);
        await store.clear();
        await Preferences.remove({ key: "biometric_enabled" });
      } catch (err) {
        console.warn("BiometricUnlockGate: exchange threw", err);
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
