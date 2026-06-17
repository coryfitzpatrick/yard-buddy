"use client";

import { OPEN_COOKIE_PREFS_EVENT } from "./CookieConsent";

interface Props {
  className?: string;
  children?: React.ReactNode;
}

// Fires the event CookieConsent listens for. Use it anywhere users might want
// to revisit their cookie/tracking choices (Footer, Settings, Privacy page).
export function CookiePreferencesLink({ className, children = "Manage cookie preferences" }: Props) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_PREFS_EVENT))}
      className={className ?? "text-sm text-green-700 hover:underline"}
    >
      {children}
    </button>
  );
}
