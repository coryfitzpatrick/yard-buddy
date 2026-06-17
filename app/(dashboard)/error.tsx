"use client";

import { useEffect } from "react";
import Link from "next/link";

// Route segment error boundary. Catches rendering errors in any
// (dashboard) page so a Prisma timeout or Stripe outage doesn't blank
// the whole app.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] route error", error);
  }, [error]);

  return (
    <div className="px-4 py-16 max-w-lg mx-auto text-center">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
      <p className="text-gray-500 mb-6">
        We couldn&apos;t load this page. The error has been logged. You can try again, or head back
        to your dashboard.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400 mb-6">Reference: {error.digest}</p>
      )}
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md px-4 py-2"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-md px-4 py-2"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
