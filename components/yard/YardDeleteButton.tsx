"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function YardDeleteButton({ yardId }: { yardId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/yard/${yardId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/yard");
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setConfirm(false);
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-red-600">Delete yard and all sections?</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-red-600 hover:bg-red-50 px-2"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Confirm"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs px-2"
          onClick={() => setConfirm(false)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-gray-400 hover:text-red-500"
      onClick={() => setConfirm(true)}
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  );
}
