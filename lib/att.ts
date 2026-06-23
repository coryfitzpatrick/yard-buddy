// iOS App Tracking Transparency helper. Wraps the @capgo plugin so the rest
// of the app can ignore the dynamic-import + non-iOS no-op dance.

import { isMobileAppClient } from "@/lib/platform";

const ATT_DECIDED_KEY = "yb-att-decided-v1";

export type AttStatus = "authorized" | "denied" | "restricted" | "notDetermined" | "unavailable";

export const ATT_STATUS_CHANGE_EVENT = "yb:att-status-change";

function isIosClient(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!isMobileAppClient()) return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Returns the current ATT status without prompting. On non-iOS or when the
 * plugin can't load, returns "unavailable" which callers treat as "no
 * restriction" (mirrors how non-iOS platforms behave for tracking).
 */
export async function getAttStatus(): Promise<AttStatus> {
  if (!isIosClient()) return "unavailable";
  try {
    const mod = await import("@capgo/capacitor-app-tracking-transparency");
    const result = await mod.AppTrackingTransparency.getStatus();
    return result.status as AttStatus;
  } catch {
    return "unavailable";
  }
}

/**
 * Show the ATT prompt and return the user's decision. Apple only shows the
 * prompt once per install; subsequent calls return the existing status
 * without re-prompting.
 */
export async function requestAttPermission(): Promise<AttStatus> {
  if (!isIosClient()) return "unavailable";
  try {
    const mod = await import("@capgo/capacitor-app-tracking-transparency");
    const result = await mod.AppTrackingTransparency.requestPermission();
    const status = result.status as AttStatus;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ATT_DECIDED_KEY, "1");
      window.dispatchEvent(new CustomEvent<AttStatus>(ATT_STATUS_CHANGE_EVENT, { detail: status }));
    }
    return status;
  } catch {
    return "unavailable";
  }
}

export function hasUserDecidedAtt(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ATT_DECIDED_KEY) === "1";
}

export function attStatusAllowsTracking(status: AttStatus): boolean {
  return status === "authorized" || status === "unavailable";
}
