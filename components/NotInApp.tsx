"use client";
import { useEffect, useState, type ReactNode } from "react";
import { isMobileAppClient } from "@/lib/platform";

export default function NotInApp({ children }: { children: ReactNode }) {
  // Hydration-safe pattern: SSR renders nothing, then client decides on mount.
  // This avoids the brief flash of paywall content before hydration runs.
  const [shouldRender, setShouldRender] = useState(false);
  useEffect(() => {
    setShouldRender(!isMobileAppClient());
  }, []);
  if (!shouldRender) return null;
  return <>{children}</>;
}
