"use client";

import { useEffect } from "react";
import {
  CONSENT_CHANGE_EVENT,
  readConsentCookie,
  type ConsentState,
} from "@/lib/consent";
import {
  getAttStatus,
  hasUserDecidedAtt,
  requestAttPermission,
} from "@/lib/att";

/**
 * Triggers the iOS App Tracking Transparency prompt the first time a user
 * grants analytics consent inside the iOS app. Apple shows the prompt only
 * once per install regardless of how many times we request it, so this
 * component is safe to mount everywhere.
 *
 * Sequence:
 * 1. User taps "Accept all" (or grants analytics in prefs) in cookie banner.
 * 2. CONSENT_CHANGE_EVENT fires with analytics=granted.
 * 3. We call requestAttPermission; on iOS the system shows the native sheet.
 *
 * If the user already decided (granted or denied), we never prompt again.
 * On non-iOS clients the helper short-circuits to "unavailable" which
 * GoogleAnalytics treats as a green light.
 */
export function IosTrackingPrompt() {
  useEffect(() => {
    let cancelled = false;

    async function maybePrompt(state: ConsentState | null) {
      if (!state || state.analytics !== "granted") return;
      if (hasUserDecidedAtt()) return;
      const current = await getAttStatus();
      if (cancelled) return;
      // "notDetermined" is the only state where the prompt hasn't been shown.
      if (current !== "notDetermined") return;
      await requestAttPermission();
    }

    // Check current state on mount in case the user already granted analytics
    // before this component existed (e.g., app updated after a prior session).
    maybePrompt(readConsentCookie());

    function onChange(e: Event) {
      const ce = e as CustomEvent<ConsentState>;
      maybePrompt(ce.detail);
    }
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
    };
  }, []);

  return null;
}
