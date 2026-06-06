"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, MapPin, Ruler, Sprout } from "lucide-react";

interface Yard {
  id: string;
  name: string;
  zipCode: string;
  yardSizeSqft: number | null;
  grassType: string;
  spreaderType: string | null;
  spreaderModel: string | null;
}

export function YardCard({ yard }: { yard: Yard }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/yard/${yard.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold text-gray-900">{yard.name}</h2>
        <div className="flex items-center gap-1 shrink-0">
          <Link href={`/yard/${yard.id}/edit`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-green-600">
              <Pencil className="w-4 h-4" />
            </Button>
          </Link>
          {confirmDelete ? (
            <>
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
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-red-500"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="text-sm text-gray-500 space-y-1">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>ZIP {yard.zipCode}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Sprout className="w-3.5 h-3.5 shrink-0" />
          <span className="capitalize">{yard.grassType.replace(/_/g, " ")}</span>
        </div>
        {yard.yardSizeSqft && (
          <div className="flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 shrink-0" />
            <span>{yard.yardSizeSqft.toLocaleString()} sq ft</span>
          </div>
        )}
        {yard.spreaderType && yard.spreaderType !== "none" && (
          <p className="text-xs text-gray-400 pt-0.5">
            {yard.spreaderModel ?? yard.spreaderType} spreader
          </p>
        )}
      </div>
    </div>
  );
}
