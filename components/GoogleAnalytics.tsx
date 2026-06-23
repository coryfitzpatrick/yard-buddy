"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { CONSENT_CHANGE_EVENT, readConsentCookie, type ConsentState } from "@/lib/consent";
import { isMobileAppClient } from "@/lib/platform";

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
  const [platform, setPlatform] = useState<Platform>("web");

  useEffect(() => {
    const stored = readConsentCookie();
    setAnalyticsGranted(stored?.analytics === "granted");
    setPlatform(detectPlatform());

    function onChange(e: Event) {
      const ce = e as CustomEvent<ConsentState>;
      const granted = ce.detail.analytics === "granted";
      setAnalyticsGranted(granted);
      // Google's documented opt-out: setting window['ga-disable-MEASUREMENT_ID']
      // to true stops further events from gtag.js even after it has loaded.
      // Lets the user revoke consent mid-session without a reload.
      (window as unknown as Record<string, boolean>)[DISABLE_KEY] = !granted;
    }
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  if (!analyticsGranted) return null;

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
