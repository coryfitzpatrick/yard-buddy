"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { Camera, CheckCircle, Images, Loader2 } from "lucide-react";
import { supabaseClient } from "@/lib/supabase-client";

export interface GrassIdentifyUploadHandle {
  reset: () => void;
}

export interface IdentifiedGrass {
  grassType: string;
  confidence: string;
  explanation: string;
}

interface Props {
  onIdentified: (result: IdentifiedGrass) => void;
  // Pulsing border that highlights the upload zone — used by YardSetupForm
  // when the user picks "unknown" so we can guide them to upload a photo.
  highlight?: boolean;
  // Container element forwarded so callers can scrollIntoView when guiding.
  containerRef?: Ref<HTMLDivElement>;
  // Called when a file picker fires; lets the parent clear the highlight flag.
  onFilePicked?: () => void;
}

export const GrassIdentifyUpload = forwardRef<GrassIdentifyUploadHandle, Props>(
  function GrassIdentifyUpload({ onIdentified, highlight = false, containerRef, onFilePicked }, ref) {
    const cameraRef = useRef<HTMLInputElement>(null);
    const photoRef = useRef<HTMLInputElement>(null);
    const [identifying, setIdentifying] = useState(false);
    const [identifyPhase, setIdentifyPhase] = useState<"uploading" | "analyzing">("uploading");
    const [identifyError, setIdentifyError] = useState<string | null>(null);
    const [identified, setIdentified] = useState<IdentifiedGrass | null>(null);

    useImperativeHandle(ref, () => ({
      reset() {
        setIdentified(null);
        setIdentifyError(null);
        setIdentifying(false);
      },
    }), []);

    async function identifyGrass(file: File) {
      setIdentifying(true);
      setIdentified(null);
      setIdentifyError(null);
      setIdentifyPhase("uploading");
      try {
        const signRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type }),
        });
        if (!signRes.ok) {
          const b = await signRes.json().catch(() => ({}));
          setIdentifyError(`Upload failed (${signRes.status}): ${b.error ?? "unknown"}`);
          return;
        }
        const { token, path, publicUrl } = await signRes.json();
        const { error: uploadError } = await supabaseClient.storage
          .from("lawn-photos")
          .uploadToSignedUrl(path, token, file, { contentType: file.type });
        if (uploadError) {
          setIdentifyError(`Upload failed: ${uploadError.message}`);
          return;
        }

        setIdentifyPhase("analyzing");
        const identifyRes = await fetch("/api/identify-grass", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: publicUrl }),
        });
        if (!identifyRes.ok) {
          setIdentifyError("Analysis failed. Try again.");
          return;
        }
        const result = (await identifyRes.json()) as IdentifiedGrass;
        setIdentified(result);
        onIdentified(result);
      } catch {
        setIdentifyError("Something went wrong. Try again.");
      } finally {
        setIdentifying(false);
      }
    }

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      e.target.value = "";
      onFilePicked?.();
      if (file) identifyGrass(file);
    }

    const containerClass = `rounded-lg border-2 border-dashed p-4 text-center transition-colors duration-300 ${
      highlight ? "border-green-500 bg-green-50 animate-pulse" : "border-green-200"
    }`;

    return (
      <div ref={containerRef} className={containerClass}>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        {identifying ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-green-500" />
            {identifyPhase === "uploading" ? "Uploading photo…" : "Analyzing your grass…"}
          </div>
        ) : identified ? (
          <div className="text-left space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle className="w-4 h-4" /> Identified at {identified.confidence} confidence
            </div>
            <p className="text-sm text-gray-500">{identified.explanation}</p>
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              className="text-sm text-green-600 underline"
            >
              Try a different photo
            </button>
          </div>
        ) : identifyError ? (
          <div className="space-y-2">
            <p className="text-sm text-red-500">{identifyError}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700"
              >
                <Camera className="w-4 h-4" /> Take Photo
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700"
              >
                <Images className="w-4 h-4" /> Choose Photo
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700"
            >
              <Camera className="w-4 h-4" /> Take Photo
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700"
            >
              <Images className="w-4 h-4" /> Choose Photo
            </button>
          </div>
        )}
      </div>
    );
  },
);
