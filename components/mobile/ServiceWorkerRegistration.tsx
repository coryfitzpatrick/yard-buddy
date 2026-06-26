"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failure is non-fatal — the app still works without PWA
      // installability. Silently swallowing prevents a console error storm
      // in environments where service workers are blocked (some embedded
      // browsers, certain corporate networks).
    });
  }, []);
  return null;
}
