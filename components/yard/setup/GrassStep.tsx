"use client";

import { GrassTypeSelector } from "@/components/yard/GrassTypeSelector";
import { GrassIdentifyUpload } from "@/components/yard/GrassIdentifyUpload";
import type { YardSectionInput } from "@/lib/validations/yard";
import type { YardSetupController } from "./useYardSetup";

export function GrassStep({ c }: { c: YardSetupController }) {
  const { grassIdentifyRef, uploadZoneRef } = c;
  const grassType = c.watch("grassType") as YardSectionInput["grassType"] | undefined;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Select your grass type, or upload a photo for AI identification.</p>
      <GrassIdentifyUpload
        ref={grassIdentifyRef}
        containerRef={uploadZoneRef}
        highlight={c.highlightUpload}
        onFilePicked={() => c.setHighlightUpload(false)}
        onIdentified={(r) => c.setValue("grassType", r.grassType as YardSectionInput["grassType"])}
      />
      <GrassTypeSelector
        value={grassType}
        onChange={(v) => {
          c.setValue("grassType", v);
          grassIdentifyRef.current?.reset();
          if (v === "unknown") {
            c.setHighlightUpload(true);
            uploadZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            c.setHighlightUpload(false);
          }
        }}
      />
      {c.errors.grassType && <p className="text-sm text-red-500">{c.errors.grassType.message}</p>}
    </div>
  );
}
