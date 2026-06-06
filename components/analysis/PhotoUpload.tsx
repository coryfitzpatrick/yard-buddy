"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2 } from "lucide-react";

interface Props {
  onUploaded: (urls: string[]) => void;
  maxImages?: number;
}

export function PhotoUpload({ onUploaded, maxImages = 4 }: Props) {
  const [previews, setPreviews] = useState<Array<{ file: File; url: string; uploaded?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    const newItems = Array.from(files).slice(0, maxImages - previews.length).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews((p) => [...p, ...newItems]);
  }

  async function uploadAll() {
    setUploading(true);
    const uploaded: string[] = [];
    for (const item of previews) {
      if (item.uploaded) { uploaded.push(item.uploaded); continue; }
      const fd = new FormData();
      fd.append("file", item.file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) uploaded.push(data.url);
    }
    setPreviews((p) => p.map((item, i) => ({ ...item, uploaded: uploaded[i] })));
    setUploading(false);
    onUploaded(uploaded);
  }

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-green-300 rounded-xl p-8 text-center cursor-pointer hover:border-green-500 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <Upload className="mx-auto h-10 w-10 text-green-400 mb-3" />
        <p className="text-sm font-medium text-gray-700">Drop photos here or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">Up to {maxImages} photos, max 10MB each</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {previews.map((item, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img src={item.url} alt="" className="object-cover w-full h-full" />
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
