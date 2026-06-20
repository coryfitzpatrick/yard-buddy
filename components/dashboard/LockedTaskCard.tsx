"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { isMobileAppClient } from "@/lib/platform";

export function LockedTaskCard() {
  // useState(false) intentional: in-app users never see the Upgrade link
  // even pre-mount. Flipping the default to true would create a paywall
  // flash on hydration. See components/NotInApp.tsx for the same pattern.
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(isMobileAppClient()), []);

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        {/* Blurred fake content skeleton — aria-hidden so screen readers skip it */}
        <div className="blur-sm pointer-events-none select-none" aria-hidden>
          <div className="flex gap-3">
            <div className="w-5 h-5 rounded-full bg-gray-200 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-5/6" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          </div>
        </div>
        {/* Upgrade overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          {inApp ? (
            <p className="flex items-center gap-1.5 bg-gray-700 text-white text-xs font-semibold rounded-full px-3 py-1.5 shadow-sm">
              <Lock className="w-3 h-3" />
              This feature requires the Pro plan.
            </p>
          ) : (
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-full px-3 py-1.5 transition-colors shadow-sm"
            >
              <Lock className="w-3 h-3" />
              Upgrade to unlock
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
