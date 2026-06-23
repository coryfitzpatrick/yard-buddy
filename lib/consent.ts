// Cookie + tracking consent storage.
//
// Category names line up with Google Consent Mode v2 so that wiring GA / GTM
// later is a single gtag('consent', 'update', …) call sourced from the same
// object stored here. See
// https://developers.google.com/tag-platform/security/guidance/consent.

export const CONSENT_COOKIE = "yb-consent";

// Bump when categories or copy change in a way that requires re-asking users.
export const CONSENT_VERSION = 1;

export type ConsentValue = "granted" | "denied";

export interface ConsentState {
  // Strictly necessary cookies (auth session, CSRF, Stripe checkout). Always
  // on; tracked here for completeness so the UI can show it as a locked row.
  necessary: "granted";
  // Site analytics — Google Analytics, page-view counting, Web Vitals.
  analytics: ConsentValue;
  // Advertising and remarketing — Google Ads, conversion tracking,
  // personalization. Off by default; not used today but reserved for when we
  // add it.
  marketing: ConsentValue;
  // Version + timestamp of the user's decision so we know when to re-ask after
  // a categories change.
  version: number;
  decidedAt: number;
}

// Default state when no decision has been made: analytics granted by default
// (US CCPA opt-out model), marketing still denied. Banner surfaces so users
// can opt out, but tracking is on by default to match common US norms.
export const DEFAULT_CONSENT: ConsentState = {
  necessary: "granted",
  analytics: "granted",
  marketing: "denied",
  version: 0,
  decidedAt: 0,
};

export const ALL_GRANTED: ConsentState = {
  necessary: "granted",
  analytics: "granted",
  marketing: "granted",
  version: CONSENT_VERSION,
  decidedAt: Date.now(),
};

export const ALL_DENIED: ConsentState = {
  necessary: "granted",
  analytics: "denied",
  marketing: "denied",
  version: CONSENT_VERSION,
  decidedAt: Date.now(),
};

export function readConsentCookie(): ConsentState | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`))
    ?.split("=")[1];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ConsentState>;
    if (typeof parsed.version !== "number" || parsed.version !== CONSENT_VERSION) {
      // Outdated decision: re-ask.
      return null;
    }
    return {
      necessary: "granted",
      analytics: parsed.analytics === "granted" ? "granted" : "denied",
      marketing: parsed.marketing === "granted" ? "granted" : "denied",
      version: parsed.version,
      decidedAt: typeof parsed.decidedAt === "number" ? parsed.decidedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeConsentCookie(state: ConsentState) {
  if (typeof document === "undefined") return;
  const oneYear = 365 * 24 * 60 * 60;
  const value = encodeURIComponent(JSON.stringify(state));
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${oneYear}; Path=/; SameSite=Lax${
    location.protocol === "https:" ? "; Secure" : ""
  }`;
}

// Custom event the rest of the app can listen to so script-loading effects
// can re-evaluate when the user updates preferences without a reload.
export const CONSENT_CHANGE_EVENT = "yb:consent-change";

export function emitConsentChange(state: ConsentState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_CHANGE_EVENT, { detail: state }));
}
