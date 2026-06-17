import { Loader2 } from "lucide-react";

// Route segment loading UI. Shown by Next.js while a (dashboard) page's
// server component is still resolving its data.
export default function DashboardLoading() {
  return (
    <div className="px-4 py-16 max-w-lg mx-auto text-center text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin text-green-500 mx-auto" />
      <p className="mt-3 text-sm">Loading…</p>
    </div>
  );
}
