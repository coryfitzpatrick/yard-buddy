"use client";

import { PhotoUpload } from "@/components/analysis/PhotoUpload";
import type { YardSetupController } from "./useYardSetup";

export function PhotosStep({ c }: { c: YardSetupController }) {
  const { photoUploadRef } = c;
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Photos are optional, but adding them now means you&apos;ll land on a populated lawn
        analysis right after Save. You can always add them later from Analyze.
      </p>
      <PhotoUpload
        ref={photoUploadRef}
        hideSubmitButton
        onSelectionChange={c.setSetupPhotoCount}
      />
    </div>
  );
}
