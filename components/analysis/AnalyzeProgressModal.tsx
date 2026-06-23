"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PHRASES = [
  "Counting blades of grass…",
  "Identifying weeds with suspicion…",
  "Asking the soil how it's feeling…",
  "Measuring how green the green is…",
  "Looking for fungal patterns…",
  "Cross-referencing with the neighbor's lawn…",
  "Sorting blades by attitude…",
  "Polling the worms for soil notes…",
  "Sizing up the crabgrass…",
  "Estimating fertilizer cravings…",
  "Bargaining with the dandelions…",
  "Reading tea leaves, but on a smaller scale…",
  "Surveying every square foot…",
  "Negotiating with the grubs…",
  "Listening for moisture stress…",
];

interface Props {
  open: boolean;
  status?: "uploading" | "analyzing";
}

export function AnalyzeProgressModal({ open, status }: Props) {
  const [idx, setIdx] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Portal target only exists in the browser. Wait for mount before rendering.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Pick a random starting phrase whenever the modal opens.
  useEffect(() => {
    if (open) setIdx(Math.floor(Math.random() * PHRASES.length));
  }, [open]);

  // Rotate the phrase every 2.5s while open.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % PHRASES.length);
    }, 2500);
    return () => clearInterval(t);
  }, [open]);

  if (!open || !mounted) return null;

  const headline =
    status === "uploading" ? "Uploading your photos" : "Analyzing your lawn";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Analysis in progress"
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/50"
      style={{ zIndex: 2147483646 }}
    >
      <div className="bg-white rounded-2xl max-w-sm w-full p-8 text-center space-y-6">
        <div className="mx-auto w-32 h-32 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lawnmowerblade.webp"
            alt=""
            aria-hidden="true"
            className="w-full h-auto"
            style={{ animation: "spin 0.9s linear infinite" }}
          />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900 mb-1">{headline}</p>
          <p
            key={idx}
            className="text-sm text-gray-500 animate-in fade-in duration-500"
          >
            {PHRASES[idx]}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
