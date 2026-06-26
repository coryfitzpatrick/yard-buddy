"use client";
import { useEffect, useState } from "react";
import { isMobileAppClient } from "@/lib/platform";

type Platform = "ios" | "android" | "other";

// Chrome fires this when the PWA is installable. We capture it and call
// .prompt() ourselves when the user opts in via our custom modal.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari sets navigator.standalone when launched from home screen
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return false;
}

export function AddToHomeScreenPrompt({
  alreadyDismissed,
  forceOpen,
  onClose,
}: {
  alreadyDismissed: boolean;
  // When true (e.g. user clicked the settings row), skip the dismissal guard
  // and show the modal directly. Closing via the X does NOT re-stamp the
  // dismissal — they came here voluntarily.
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isMobileAppClient()) return; // already in the native shell
    if (isStandalone()) return; // already installed as PWA on this device
    const p = detectPlatform();
    setPlatform(p);
    if (p === "other") return;

    if (p === "android") {
      const handler = (e: Event) => {
        e.preventDefault();
        setInstallEvent(e as BeforeInstallPromptEvent);
        if (forceOpen || !alreadyDismissed) setOpen(true);
      };
      window.addEventListener("beforeinstallprompt", handler as EventListener);
      return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
    }

    // iOS: no programmatic install event, just open if eligible
    if (p === "ios" && (forceOpen || !alreadyDismissed)) {
      setOpen(true);
    }
  }, [alreadyDismissed, forceOpen]);

  async function stampDismissed() {
    try {
      await fetch("/api/user/dismiss-home-screen-prompt", { method: "POST" });
    } catch {
      // Non-fatal: worst case the user sees the prompt again next login.
    }
  }

  async function handleInstall() {
    if (platform === "android" && installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
        // Either way, don't ambush them again from the auto-prompt path.
        // If they accepted, the app is installed and the standalone check
        // will suppress on next mount. If they dismissed, respect that.
        await stampDismissed();
      }
      setInstallEvent(null);
    }
    setOpen(false);
    onClose?.();
  }

  async function handleNotNow() {
    if (!forceOpen) await stampDismissed();
    setOpen(false);
    onClose?.();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">
          Add Yard Analyzer to your home screen
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Get a one-tap icon, faster loading, and a full-screen experience without the browser bar.
        </p>

        {platform === "ios" && (
          <ol className="mt-4 space-y-2 text-sm text-gray-700">
            <li className="flex gap-2">
              <span className="font-semibold text-green-600">1.</span>
              <span>
                Tap the Share button{" "}
                <span aria-hidden className="inline-block px-1 font-mono">⎋</span>{" "}
                at the bottom of Safari.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-green-600">2.</span>
              <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-green-600">3.</span>
              <span>Tap <strong>Add</strong> in the top right.</span>
            </li>
          </ol>
        )}

        {platform === "android" && installEvent && (
          <p className="mt-4 text-sm text-gray-700">
            Tap <strong>Install</strong> below and confirm when your browser asks.
          </p>
        )}

        <div className="mt-6 flex gap-2">
          {platform === "android" && installEvent ? (
            <button
              onClick={handleInstall}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Install
            </button>
          ) : platform === "ios" ? (
            <button
              onClick={handleInstall}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Got it
            </button>
          ) : null}
          <button
            onClick={handleNotNow}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {forceOpen ? "Close" : "Not now"}
          </button>
        </div>
      </div>
    </div>
  );
}
