"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Trash2 } from "lucide-react";

export function YardDeleteButton({ yardId, yardName }: { yardId: string; yardName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/yard/${yardId}`, { method: "DELETE" });
      if (res.ok) {
        setOpen(false);
        router.push("/yard");
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-400 hover:text-red-500"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>

      <DeleteConfirmModal
        open={open}
        onOpenChange={setOpen}
        title={`Delete "${yardName}"?`}
        description="This cannot be undone. The yard and all its sections, analyses, and tasks will be permanently deleted."
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </>
  );
}
