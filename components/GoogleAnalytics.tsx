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

function isDebug(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.search.includes("ga-debug=1")) return true;
  if (window.sessionStorage.getItem("ga-debug") === "1") return true;
  return false;
}

function dlog(...args: unknown[]) {
  if (typeof window !== "undefined" && isDebug()) console.log("[ga-debug]", ...args);
}

export function GoogleAnalytics() {
  // null = not hydrated yet (avoid SSR/CSR mismatch on the Script tag).
  const [analyticsGranted, setAnalyticsGranted] = useState<boolean | null>(null);
  const [attAllows, setAttAllows] = useState<boolean | null>(null);
  const [platform, setPlatform] = useState<Platform>("web");

  useEffect(() => {
    // Sticky debug: ?ga-debug=1 once enables it for the whole session.
    if (typeof window !== "undefined" && window.location.search.includes("ga-debug=1")) {
      window.sessionStorage.setItem("ga-debug", "1");
    }
    const stored = readConsentCookie();
    const granted = stored?.analytics === "granted";
    setAnalyticsGranted(granted);
    setPlatform(detectPlatform());
    dlog("mount", { storedConsent: stored, analyticsGranted: granted });
    getAttStatus().then((status) => {
      const allows = attStatusAllowsTracking(status);
      setAttAllows(allows);
      dlog("att status", { status, allows });
    });

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
  if (analyticsGranted !== true) {
    dlog("not rendering: analyticsGranted =", analyticsGranted);
    return null;
  }
  if (attAllows === null || attAllows === false) {
    dlog("not rendering: attAllows =", attAllows);
    return null;
  }

  const debugOn = isDebug();
  const configExtras = debugOn ? ", debug_mode: true" : "";
  dlog("rendering gtag scripts", { GA_ID, platform, debugOn });

  return (
    <>
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('set', 'user_properties', { platform: ${JSON.stringify(platform)} });
          gtag('config', '${GA_ID}', { send_page_view: true${configExtras} });
          ${debugOn ? "console.log('[ga-debug] gtag initialized', '${GA_ID}');" : ""}
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
        onLoad={() => dlog("gtag.js loaded")}
        onError={(e) => dlog("gtag.js failed", e)}
      />
    </>
  );
}
