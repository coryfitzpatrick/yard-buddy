"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Ruler, Sprout, ArrowRight } from "lucide-react";
import { AREA_CONFIG } from "./AreaTypeSelector";
import type { AreaType } from "@/types";

interface Section {
  id: string;
  yardId: string;
  name: string;
  areaType: string | null;
  grassType: string;
  yardSizeSqft: number | null;
  spreaderType: string | null;
  spreaderModel: string | null;
}

export function SectionCard({ section }: { section: Section }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const areaCfg = section.areaType ? AREA_CONFIG[section.areaType as AreaType] : null;
  const AreaIcon = areaCfg?.icon;

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/yard/${section.yardId}/sections/${section.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-gray-900">{section.name}</div>
          {areaCfg && AreaIcon && (
            <div className="flex items-center gap-1 text-sm text-gray-400 mt-0.5">
              <AreaIcon className="w-3.5 h-3.5" /> {areaCfg.label}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link href={`/yard/${section.yardId}/sections/${section.id}/edit`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-green-600">
              <Pencil className="w-4 h-4" />
            </Button>
          </Link>
          {confirmDelete ? (
            <>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-red-600 hover:bg-red-50 px-2" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Confirm"}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="text-sm text-gray-500 space-y-1">
        <div className="flex items-center gap-1.5">
          <Sprout className="w-3.5 h-3.5" />
          <span className="capitalize">{section.grassType.replace(/_/g, " ")}</span>
        </div>
        {section.yardSizeSqft && (
          <div className="flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5" />
            <span>{section.yardSizeSqft.toLocaleString()} sq ft</span>
          </div>
        )}
      </div>
      <Link href={`/yard/${section.yardId}/sections/${section.id}`} className="mt-auto">
        <Button variant="outline" size="sm" className="w-full">
          <ArrowRight className="w-3.5 h-3.5 mr-1" /> View
        </Button>
      </Link>
    </div>
  );
}
