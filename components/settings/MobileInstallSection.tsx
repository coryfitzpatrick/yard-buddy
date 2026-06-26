"use client";
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { AddToHomeScreenPrompt } from "@/components/mobile/AddToHomeScreenPrompt";
import { isMobileAppClient } from "@/lib/platform";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return false;
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
}

export function MobileInstallSection({ alreadyDismissed }: { alreadyDismissed: boolean }) {
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isMobileAppClient()) return;
    if (isStandalone()) return;
    if (!isMobileUserAgent()) return;
    setEligible(true);
  }, []);

  if (!eligible) return null;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900">App</h2>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Add to home screen</p>
            <p className="mt-1 text-sm text-gray-600">
              Get a one-tap icon and a full-screen experience.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            Install
          </button>
        </div>
      </div>
      {open && (
        <AddToHomeScreenPrompt
          alreadyDismissed={alreadyDismissed}
          forceOpen
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
