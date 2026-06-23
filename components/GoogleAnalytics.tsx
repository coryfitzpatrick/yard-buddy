"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { CONSENT_CHANGE_EVENT, readConsentCookie, type ConsentState } from "@/lib/consent";
import { isMobileAppClient } from "@/lib/platform";
import {
  ATT_STATUS_CHANGE_EVENT,
  attStatusAllowsTracking,
  getAttStatus,
  type AttStatus,
} from "@/lib/att";

const GA_ID = "G-X67N0138W9";
const DISABLE_KEY = `ga-disable-${GA_ID}`;

type Platform = "web" | "ios_app" | "android_app";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "web";
  if (!isMobileAppClient()) return "web";
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios_app" : "android_app";
}

export function GoogleAnalytics() {
  // null = not hydrated yet (avoid SSR/CSR mismatch on the Script tag).
  const [analyticsGranted, setAnalyticsGranted] = useState<boolean | null>(null);
  const [attAllows, setAttAllows] = useState<boolean | null>(null);
  const [platform, setPlatform] = useState<Platform>("web");

  useEffect(() => {
    const stored = readConsentCookie();
    setAnalyticsGranted(stored?.analytics === "granted");
    setPlatform(detectPlatform());
    getAttStatus().then((status) => setAttAllows(attStatusAllowsTracking(status)));

    function onConsent(e: Event) {
      const ce = e as CustomEvent<ConsentState>;
      const granted = ce.detail.analytics === "granted";
      setAnalyticsGranted(granted);
      // Google's documented opt-out: setting window['ga-disable-MEASUREMENT_ID']
      // to true stops further events from gtag.js even after it has loaded.
      // Lets the user revoke consent mid-session without a reload.
      (window as unknown as Record<string, boolean>)[DISABLE_KEY] = !granted;
    }
    function onAtt(e: Event) {
      const ce = e as CustomEvent<AttStatus>;
      const allows = attStatusAllowsTracking(ce.detail);
      setAttAllows(allows);
      (window as unknown as Record<string, boolean>)[DISABLE_KEY] = !allows;
    }
    window.addEventListener(CONSENT_CHANGE_EVENT, onConsent);
    window.addEventListener(ATT_STATUS_CHANGE_EVENT, onAtt);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, onConsent);
      window.removeEventListener(ATT_STATUS_CHANGE_EVENT, onAtt);
    };
  }, []);

  // Hold off rendering until we know both signals so we never load the script
  // for a user who hasn't consented yet on either layer.
  if (analyticsGranted !== true) return null;
  if (attAllows === null || attAllows === false) return null;

  return (
    <>
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('set', 'user_properties', { platform: ${JSON.stringify(platform)} });
          gtag('config', '${GA_ID}');
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
    </>
  );
}
