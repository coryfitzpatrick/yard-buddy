"use client";

import { cn } from "@/lib/utils";

interface Section {
  id: string;
  name: string;
}

interface Props {
  sections: Section[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

export function SectionFilterPills({ sections, activeId, onSelect }: Props) {
  if (sections.length <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors",
          activeId === null
            ? "bg-green-600 text-white"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        )}
      >
        All
      </button>
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors whitespace-nowrap",
            activeId === s.id
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}
