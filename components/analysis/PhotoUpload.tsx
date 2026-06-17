"use client";

import { useState, useRef, forwardRef, useImperativeHandle, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Camera, Images, X, Loader2, Expand, ZoomIn, ScanEye, Sprout, ImagePlus, Plus, Trash2 } from "lucide-react";
import { supabaseClient } from "@/lib/supabase-client";
import {
  PHOTO_KIND_META,
  INITIAL_SLOT_KINDS,
  MAX_PHOTOS,
  type PhotoKind,
} from "@/lib/photo-kinds";

export interface UploadedPhoto {
  url: string;
  kind: string;
}

export interface PhotoUploadHandle {
  upload: () => Promise<UploadedPhoto[]>;
  hasSelection: () => boolean;
}

interface Props {
  onUploaded?: (photos: UploadedPhoto[]) => void;
  onSelectionChange?: (count: number) => void;
  onReset?: () => void;
  analyzing?: boolean;
  // Hide the built-in "Analyze N Photos" submit button — useful when the parent
  // owns the submit action and just wants this component for photo collection.
  hideSubmitButton?: boolean;
}

interface Slot {
  id: string;
  kind: PhotoKind;
  // True for the slots present on first render — they can be cleared but not deleted.
  fixed: boolean;
  state?: { file: File; preview: string; uploaded?: string };
}

const KIND_ICONS: Record<PhotoKind, typeof Expand> = {
  wide: Expand,
  closeup: ZoomIn,
  damage: ScanEye,
  weed: Sprout,
  other: ImagePlus,
};

function makeInitialSlots(): Slot[] {
  return INITIAL_SLOT_KINDS.map((kind, i) => ({
    id: `init-${i}-${kind}`,
    kind,
    fixed: true,
  }));
}

let slotCounter = 0;
function nextId(kind: PhotoKind) {
  slotCounter += 1;
  return `added-${slotCounter}-${kind}`;
}

export const PhotoUpload = forwardRef<PhotoUploadHandle, Props>(function PhotoUpload(
  { onUploaded, onSelectionChange, onReset, analyzing = false, hideSubmitButton = false },
  ref
) {
  const [slots, setSlots] = useState<Slot[]>(() => makeInitialSlots());
  const [uploading, setUploading] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputs = useRef<Record<string, HTMLInputElement | null>>({});

  function patchSlot(id: string, patch: Partial<Slot>) {
    if (analyzing) onReset?.();
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function attachFile(id: string, file: File) {
    patchSlot(id, { state: { file, preview: URL.createObjectURL(file) } });
  }

  function clearSlot(id: string) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, state: undefined } : s)));
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  function addAnother(kind: PhotoKind, afterId: string) {
    if (slots.length >= MAX_PHOTOS) return;
    setSlots((prev) => {
      const idx = prev.findIndex((s) => s.id === afterId);
      const newSlot: Slot = { id: nextId(kind), kind, fixed: false };
      if (idx === -1) return [...prev, newSlot];
      return [...prev.slice(0, idx + 1), newSlot, ...prev.slice(idx + 1)];
    });
  }

  const populated = slots.filter((s) => s.state);
  const totalSlots = slots.length;
  const canAddMore = totalSlots < MAX_PHOTOS;

  // Notify parent of selection-count changes so it can enable/disable its own
  // submit affordance (used by YardSetupForm).
  useEffect(() => {
    onSelectionChange?.(populated.length);
  }, [populated.length, onSelectionChange]);

  async function uploadAll(): Promise<UploadedPhoto[]> {
    setUploading(true);
    try {
      const results: UploadedPhoto[] = [];
      for (const slot of populated) {
        const state = slot.state!;
        if (state.uploaded) {
          results.push({ url: state.uploaded, kind: slot.kind });
          continue;
        }
        try {
          const signRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contentType: state.file.type }),
          });
          if (!signRes.ok) continue;
          const { token, path, publicUrl } = await signRes.json();
          const { error } = await supabaseClient.storage
            .from("lawn-photos")
            .uploadToSignedUrl(path, token, state.file, { contentType: state.file.type });
          if (error) continue;
          setSlots((prev) =>
            prev.map((s) =>
              s.id === slot.id && s.state ? { ...s, state: { ...s.state, uploaded: publicUrl } } : s
            )
          );
          results.push({ url: publicUrl, kind: slot.kind });
        } catch {
          // skip individual upload failure; other photos still go through
        }
      }
      if (results.length > 0) onUploaded?.(results);
      return results;
    } finally {
      setUploading(false);
    }
  }

  useImperativeHandle(ref, () => ({
    upload: uploadAll,
    hasSelection: () => populated.length > 0,
  }), [populated.length]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3">
        <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1">
          Photo guide
        </p>
        <p className="text-xs text-gray-600">
          Use the slots below to upload photos by type. Skip anything that doesn&apos;t apply. Damage,
          weed, and other slots accept multiples. Tap{" "}
          <span className="font-medium text-gray-700">+ Add another</span> to capture different
          zones or species. Only the wide overview is truly critical.
        </p>
      </div>

      <p className="text-xs text-gray-400 text-center">
        {populated.length}/{MAX_PHOTOS} photos added
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(() => {
          // Count slots per kind so we can enforce maxPerKind on "+ Add another".
          const countByKind = new Map<PhotoKind, number>();
          slots.forEach((s) => countByKind.set(s.kind, (countByKind.get(s.kind) ?? 0) + 1));
          return slots.map((slot) => {
            const meta = PHOTO_KIND_META[slot.kind];
            const Icon = KIND_ICONS[slot.kind] ?? ImagePlus;
            const currentOfKind = countByKind.get(slot.kind) ?? 1;
            const kindAtCap = meta.maxPerKind != null && currentOfKind >= meta.maxPerKind;
            const showAddAnother = meta.maxPerKind !== 1 && !!slot.state && canAddMore && !kindAtCap;
            const limitLabel =
              meta.maxPerKind === 1
                ? "1 photo max"
                : meta.maxPerKind != null
                  ? `Up to ${meta.maxPerKind}`
                  : null;
            return (
              <SlotCard
                key={slot.id}
                slot={slot}
                icon={Icon}
                labelOverride={meta.label}
                limitLabel={limitLabel}
                description={meta.description}
                cameraRef={(el) => { cameraInputs.current[slot.id] = el; }}
                fileRef={(el) => { fileInputs.current[slot.id] = el; }}
                onPickCamera={() => cameraInputs.current[slot.id]?.click()}
                onPickFile={() => fileInputs.current[slot.id]?.click()}
                onFile={(f) => attachFile(slot.id, f)}
                onClearPhoto={() => clearSlot(slot.id)}
                onRemoveSlot={!slot.fixed ? () => removeSlot(slot.id) : undefined}
                onAddAnother={showAddAnother ? () => addAnother(slot.kind, slot.id) : undefined}
              />
            );
          });
        })()}
      </div>

      {!hideSubmitButton && !analyzing && (
        <div className="flex">
          {/* Span wrapper carries the title so it still shows when the button is
              disabled (Base UI disables pointer events on disabled buttons). */}
          <span
            title={populated.length === 0 ? "Add at least one photo to analyze" : undefined}
            className="inline-block"
          >
            <Button
              onClick={uploadAll}
              disabled={uploading || populated.length === 0}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500"
            >
              {uploading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
              ) : populated.length === 0 ? (
                "Analyze"
              ) : (
                `Analyze ${populated.length} Photo${populated.length > 1 ? "s" : ""}`
              )}
            </Button>
          </span>
        </div>
      )}
    </div>
  );
});

interface SlotCardProps {
  slot: Slot;
  icon: typeof Expand;
  labelOverride: string;
  limitLabel: string | null;
  description: string;
  cameraRef: (el: HTMLInputElement | null) => void;
  fileRef: (el: HTMLInputElement | null) => void;
  onPickCamera: () => void;
  onPickFile: () => void;
  onFile: (f: File) => void;
  onClearPhoto: () => void;
  onRemoveSlot?: () => void;
  onAddAnother?: () => void;
}

function SlotCard({ slot, icon: Icon, labelOverride, limitLabel, description, cameraRef, fileRef, onPickCamera, onPickFile, onFile, onClearPhoto, onRemoveSlot, onAddAnother }: SlotCardProps) {
  const filled = !!slot.state;
  return (
    <div className={`rounded-xl border-2 transition-colors ${filled ? "border-green-300 bg-green-50/40" : "border-dashed border-gray-200 bg-white"}`}>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }}
      />
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${filled ? "text-green-600" : "text-gray-400"}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 leading-tight">{labelOverride}</span>
              {limitLabel && (
                <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">{limitLabel}</span>
              )}
            </div>
            <p className="text-xs text-gray-500 leading-snug mt-0.5">{description}</p>
          </div>
          {onRemoveSlot && !filled && (
            <button
              type="button"
              onClick={onRemoveSlot}
              className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
              aria-label={`Remove this ${labelOverride.toLowerCase()} slot`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {filled ? (
          <div className="flex items-center gap-3 pt-1">
            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
              <Image src={slot.state!.preview} alt={`${labelOverride} preview`} fill className="object-cover" unoptimized />
            </div>
            <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
              <span className="text-xs text-green-700 font-medium truncate">Photo ready</span>
              <button
                type="button"
                onClick={onClearPhoto}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 font-medium px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                aria-label={`Remove ${labelOverride} photo`}
              >
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onPickCamera}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-green-200 bg-white py-3 text-xs text-green-700 hover:bg-green-50 transition-colors"
            >
              <Camera className="w-4 h-4" />
              Take
            </button>
            <button
              type="button"
              onClick={onPickFile}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-3 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Images className="w-4 h-4" />
              Upload
            </button>
          </div>
        )}

        {onAddAnother && (
          <button
            type="button"
            onClick={onAddAnother}
            className="w-full mt-1 flex items-center justify-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium py-1.5 rounded-md hover:bg-green-50 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add another {labelOverride.toLowerCase()}
          </button>
        )}
      </div>
    </div>
  );
}
