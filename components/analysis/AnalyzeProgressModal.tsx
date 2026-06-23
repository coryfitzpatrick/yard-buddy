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
        <div className="mx-auto w-24 h-24 relative">
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            style={{ animation: "spin 1s linear infinite" }}
            aria-hidden="true"
          >
            {/* Lawn-mower blade: a single horizontal bar with angled
                cutting tips at each end, plus a center hub. The whole svg
                spins so the cutting tips trace a disc. */}
            <rect x="6" y="46" width="88" height="8" rx="2" fill="#16a34a" />
            <polygon points="6,46 14,40 14,46" fill="#15803d" />
            <polygon points="94,46 86,40 86,46" fill="#15803d" />
            <polygon points="6,54 14,60 14,54" fill="#15803d" />
            <polygon points="94,54 86,60 86,54" fill="#15803d" />
            <circle cx="50" cy="50" r="9" fill="#052e16" />
            <circle cx="50" cy="50" r="3" fill="#15803d" />
          </svg>
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
