"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Camera, Images, X, Loader2, Expand, ZoomIn, ScanEye } from "lucide-react";
import { supabaseClient } from "@/lib/supabase-client";

interface Props {
  onUploaded: (urls: string[]) => void;
  maxImages?: number;
}

export function PhotoUpload({ onUploaded, maxImages = 4 }: Props) {
  const [previews, setPreviews] = useState<Array<{ file: File; url: string; uploaded?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    const newItems = Array.from(files).slice(0, maxImages - previews.length).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews((p) => [...p, ...newItems]);
  }

  async function uploadAll() {
    setUploading(true);
    try {
      const uploaded: Array<string | null> = [];
      for (const item of previews) {
        if (item.uploaded) { uploaded.push(item.uploaded); continue; }
        try {
          // Step 1: get signed upload URL (auth check server-side)
          const signRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contentType: item.file.type }),
          });
          if (!signRes.ok) { uploaded.push(null); continue; }
          const { token, path, publicUrl } = await signRes.json();

          // Step 2: upload directly to Supabase
          const { error } = await supabaseClient.storage
            .from("lawn-photos")
            .uploadToSignedUrl(path, token, item.file, { contentType: item.file.type });
          uploaded.push(error ? null : publicUrl);
        } catch {
          uploaded.push(null);
        }
      }
      setPreviews((p) => p.map((item, i) => ({ ...item, uploaded: uploaded[i] ?? undefined })));
      onUploaded(uploaded.filter((u): u is string => u !== null));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {/* Photo tips */}
      <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">Tips for the best analysis</p>
        <ul className="space-y-1.5">
          <li className="flex items-start gap-2 text-xs text-gray-600">
            <Expand className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
            <span><span className="font-medium text-gray-700">Wide shot</span> — stand back and photograph the whole section so patterns and problem zones are visible</span>
          </li>
          <li className="flex items-start gap-2 text-xs text-gray-600">
            <ZoomIn className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
            <span><span className="font-medium text-gray-700">Close-up at ground level</span> — crouch down and shoot toward the soil to reveal thatch, bare soil, and disease up close</span>
          </li>
          <li className="flex items-start gap-2 text-xs text-gray-600">
            <ScanEye className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
            <span><span className="font-medium text-gray-700">Problem spots</span> — zoom in on any dead patches, discoloration, or areas that look different from the rest</span>
          </li>
        </ul>
      </div>

      {/* Picker buttons */}
      {(() => {
        const atMax = previews.length >= maxImages;
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={atMax}
                onClick={() => !atMax && cameraRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 transition-colors ${atMax ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-50" : "border-green-300 hover:border-green-500 hover:bg-green-50"}`}
              >
                <Camera className={`h-8 w-8 ${atMax ? "text-gray-300" : "text-green-500"}`} />
                <span className={`text-sm font-medium ${atMax ? "text-gray-400" : "text-gray-700"}`}>Take Photo</span>
              </button>
              <button
                type="button"
                disabled={atMax}
                onClick={() => !atMax && inputRef.current?.click()}
                onDragOver={(e) => { if (!atMax) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (!atMax) handleFiles(e.dataTransfer.files); }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 transition-colors ${atMax ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-50" : "border-gray-200 hover:border-green-400 hover:bg-green-50"}`}
              >
                <Images className={`h-8 w-8 ${atMax ? "text-gray-300" : "text-gray-400"}`} />
                <span className={`text-sm font-medium ${atMax ? "text-gray-400" : "text-gray-700"}`}>Choose Photo</span>
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center">
              {atMax ? `${maxImages}/${maxImages} photos — remove one to add another` : `${previews.length}/${maxImages} photos added`}
            </p>
          </>
        );
      })()}

      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {previews.map((item, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <Image src={item.url} alt="Lawn photo preview" fill className="object-cover" unoptimized />
              <button
                className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5 text-white hover:bg-black/70"
                onClick={() => setPreviews((p) => p.filter((_, j) => j !== i))}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {previews.length > 0 && (
        <Button
          onClick={uploadAll}
          disabled={uploading}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          {uploading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
          ) : (
            `Analyze ${previews.length} Photo${previews.length > 1 ? "s" : ""}`
          )}
        </Button>
      )}
    </div>
  );
}
