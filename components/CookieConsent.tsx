"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  ALL_DENIED,
  ALL_GRANTED,
  CONSENT_VERSION,
  DEFAULT_CONSENT,
  emitConsentChange,
  readConsentCookie,
  writeConsentCookie,
  type ConsentState,
  type ConsentValue,
} from "@/lib/consent";

// Local IDs used by the "open cookie preferences" link in settings/footer.
export const OPEN_COOKIE_PREFS_EVENT = "yb:open-cookie-prefs";

interface CategoryRow {
  key: keyof Pick<ConsentState, "necessary" | "analytics" | "marketing">;
  label: string;
  description: string;
  locked?: boolean;
}

const CATEGORIES: CategoryRow[] = [
  {
    key: "necessary",
    label: "Strictly necessary",
    description:
      "Required for the site to work. Covers your sign-in session, Stripe checkout, and CSRF protection. Cannot be turned off.",
    locked: true,
  },
  {
    key: "analytics",
    label: "Analytics",
    description:
      "Helps us understand how the site is used so we can improve it. Aggregated page views and basic device info; never sold.",
  },
  {
    key: "marketing",
    label: "Advertising",
    description:
      "Not in use today. Reserved for if we later run ads or remarketing; you can pre-emptively decline.",
  },
];

export function CookieConsent() {
  // null = not hydrated yet (avoid flashing on SSR), DEFAULT_CONSENT = unset.
  const [consent, setConsent] = useState<ConsentState | null>(null);
  // Banner visible until the user decides; preferences modal flips this open.
  const [showBanner, setShowBanner] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [draft, setDraft] = useState<ConsentState>(DEFAULT_CONSENT);

  // Hydrating from document.cookie has to happen post-mount: server has no
  // cookies and we want SSR/CSR markup to match (see the consent === null
  // early-return below). The effect intentionally seeds state from an external
  // source, which the set-state-in-effect rule flags but the React docs
  // explicitly allow for "subscribe to / read from external system" patterns.
  useEffect(() => {
    const stored = readConsentCookie();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (stored) {
      setConsent(stored);
      setShowBanner(false);
    } else {
      setConsent(DEFAULT_CONSENT);
      setShowBanner(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Settings (or anywhere else) can re-open the preferences modal by
  // dispatching this event — no need to pass refs across the tree.
  useEffect(() => {
    function open() {
      setDraft(consent ?? DEFAULT_CONSENT);
      setShowPrefs(true);
      setShowBanner(false);
    }
    window.addEventListener(OPEN_COOKIE_PREFS_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_PREFS_EVENT, open);
  }, [consent]);

  // URL-triggered open: ?cookie-prefs=1 (handy on mobile where the footer
  // link can be hard to reach behind the bottom nav).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).has("cookie-prefs")) {
      setDraft(consent ?? DEFAULT_CONSENT);
      setShowPrefs(true);
      setShowBanner(false);
    }
  }, [consent]);

  function persist(next: ConsentState) {
    writeConsentCookie(next);
    setConsent(next);
    setShowBanner(false);
    setShowPrefs(false);
    emitConsentChange(next);
  }

  if (consent === null) return null; // Avoid SSR/CSR mismatch.

  return (
    <>
      {showBanner && !showPrefs && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Cookie preferences"
          className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="max-w-5xl mx-auto px-4 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex-1 text-sm text-gray-700 leading-snug">
              <p className="font-semibold text-gray-900">We use cookies</p>
              <p className="mt-1">
                Essential cookies keep you signed in and let billing work. With your permission we
                would also use analytics cookies to learn how the site is being used. You can change
                this any time in settings.{" "}
                <Link href="/privacy" className="underline text-green-700">
                  Privacy policy
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDraft(consent);
                  setShowPrefs(true);
                }}
                className="text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-md px-3 py-2"
              >
                Customize
              </button>
              <button
                type="button"
                onClick={() => persist(ALL_DENIED)}
                className="text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-md px-3 py-2"
              >
                Reject all
              </button>
              <button
                type="button"
                onClick={() => persist(ALL_GRANTED)}
                className="text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md px-4 py-2"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrefs && (
        <PreferencesModal
          initial={draft}
          onClose={() => {
            // If they cancel before deciding for the first time, leave banner up.
            setShowPrefs(false);
            if (!consent || consent.version !== CONSENT_VERSION) setShowBanner(true);
          }}
          onSave={persist}
        />
      )}
    </>
  );
}

interface PreferencesModalProps {
  initial: ConsentState;
  onClose: () => void;
  onSave: (state: ConsentState) => void;
}

function PreferencesModal({ initial, onClose, onSave }: PreferencesModalProps) {
  const [analytics, setAnalytics] = useState<ConsentValue>(initial.analytics);
  const [marketing, setMarketing] = useState<ConsentValue>(initial.marketing);

  function save() {
    onSave({
      necessary: "granted",
      analytics,
      marketing,
      version: CONSENT_VERSION,
      decidedAt: Date.now(),
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cookie preferences"
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Cookie preferences</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preferences"
            className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {CATEGORIES.map((cat) => {
            const value =
              cat.key === "necessary" ? "granted" : cat.key === "analytics" ? analytics : marketing;
            const setter =
              cat.key === "analytics" ? setAnalytics : cat.key === "marketing" ? setMarketing : null;
            return (
              <div key={cat.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{cat.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{cat.description}</p>
                </div>
                {cat.locked ? (
                  <span className="shrink-0 text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                    Always on
                  </span>
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={value === "granted"}
                    onClick={() => setter?.(value === "granted" ? "denied" : "granted")}
                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      value === "granted" ? "bg-green-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        value === "granted" ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => onSave(ALL_DENIED)}
            className="text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-md px-3 py-2"
          >
            Reject all
          </button>
          <button
            type="button"
            onClick={() => onSave(ALL_GRANTED)}
            className="text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-md px-3 py-2"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={save}
            className="text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md px-4 py-2"
          >
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}
