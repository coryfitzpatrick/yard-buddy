"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  archivedCount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteArchivedModal({ archivedCount, onClose, onSuccess }: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = confirmation === "DELETE";

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!isValid) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/yards/archived/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    if (res.ok) {
      onSuccess();
      return;
    }
    setBusy(false);
    setError("Something went wrong. Try again.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-archived-title"
        tabIndex={-1}
        className="bg-white rounded-2xl max-w-md w-full mx-4 p-6 outline-none"
      >
        <h2 id="delete-archived-title" className="text-lg font-semibold text-gray-900 mb-1">
          Delete archived yards
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          This permanently deletes all {archivedCount} archived yard{archivedCount === 1 ? "" : "s"}, their analyses, tasks, and photos. This cannot be undone.
        </p>

        <label htmlFor="delete-archived-confirmation" className="block text-sm font-medium text-gray-900 mb-1">
          Type DELETE to confirm
        </label>
        <input
          id="delete-archived-confirmation"
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={busy}
          placeholder="DELETE"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
        />

        {error && (
          <p role="alert" className="text-sm text-red-700 mb-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!isValid || busy} className="bg-red-600 hover:bg-red-700 text-white">
            {busy ? "Deleting..." : "Delete permanently"}
          </Button>
        </div>
      </div>
    </div>
  );
}
