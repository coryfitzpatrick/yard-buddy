export type PhotoKind = "wide" | "closeup" | "damage" | "weed" | "other";

export interface PhotoKindMeta {
  kind: PhotoKind;
  label: string;
  description: string;
  // Label sent to Claude — keep it short and specific.
  promptLabel: string;
  // Max photos of this kind. undefined = no per-kind cap (still subject to MAX_PHOTOS overall).
  maxPerKind?: number;
}

export const PHOTO_KIND_META: Record<PhotoKind, PhotoKindMeta> = {
  wide: {
    kind: "wide",
    label: "Wide overview",
    description: "Step back and capture the whole section so patterns and problem zones are visible.",
    promptLabel: "wide overview of the whole section",
    maxPerKind: 1,
  },
  closeup: {
    kind: "closeup",
    label: "Close-up of grass",
    description: "Crouch down so you can show blade detail, thatch, and soil up close.",
    promptLabel: "ground-level close-up of grass blades, thatch, and soil",
    maxPerKind: 1,
  },
  damage: {
    kind: "damage",
    label: "Damage or dead spot",
    description: "Discoloration, bare patches, or dying turf. Add one per distinct zone.",
    promptLabel: "damage, dead spot, or discoloration",
    // No cap — capture as many distinct damage zones as needed (subject to MAX_PHOTOS).
  },
  weed: {
    kind: "weed",
    label: "Weed close-up",
    description: "Zoom in on a weed for species ID. Add one per different species.",
    promptLabel: "close-up of a weed for species identification",
    // No cap — yards often have many weed species.
  },
  other: {
    kind: "other",
    label: "Other",
    description: "Edge transitions, fence-line shade, irrigation coverage, or anything else worth flagging.",
    promptLabel: "additional context photo (homeowner's choice)",
    maxPerKind: 2,
  },
};

// Initial slots shown when the form mounts. User can spawn more (up to maxPerKind)
// for damage, weed, and other via "Add another" buttons.
export const INITIAL_SLOT_KINDS: PhotoKind[] = ["wide", "closeup", "damage", "weed", "other"];

// Hard cap on total photos per analysis.
export const MAX_PHOTOS = 10;

export function promptLabelFor(kind: string): string {
  const meta = PHOTO_KIND_META[kind as PhotoKind];
  return meta?.promptLabel ?? "additional context photo";
}
