import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { Images } from "lucide-react";
import { SectionHealthChart } from "@/components/yard/SectionHealthChart";

export interface AnalysisRow {
  id: string;
  healthScore: number;
  summary: string;
  issues: string[];
  imageUrls: string[];
  createdAt: Date;
}

interface Props {
  analyses: AnalysisRow[];
  photoHistoryHref?: string | null;
  totalPhotoCount?: number;
}

function colorForScore(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

export function YardAnalysisTimeline({ analyses, photoHistoryHref, totalPhotoCount = 0 }: Props) {
  if (analyses.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6 text-center text-sm text-gray-400">
        No analyses yet. Tap Analyze to get started.
      </div>
    );
  }

  const latest = analyses[0]!;
  const chartData = [...analyses].reverse().map((a) => ({
    date: a.createdAt.toISOString(),
    score: a.healthScore,
  }));

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 space-y-4">
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-bold ${colorForScore(latest.healthScore)}`}>
            {latest.healthScore}
          </span>
          <span className="text-sm text-gray-400">/ 100 health score</span>
          <span className="text-xs text-gray-400 ml-auto">
            {format(latest.createdAt, "MMM d, yyyy")}
          </span>
        </div>
        {chartData.length >= 2 && <SectionHealthChart data={chartData} />}
        {latest.summary && <p className="text-sm text-gray-700">{latest.summary}</p>}
        {latest.issues.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {latest.issues.map((issue) => (
              <span
                key={issue}
                className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5"
              >
                {issue}
              </span>
            ))}
          </div>
        )}
        {latest.imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {latest.imageUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <Image
                  src={url}
                  alt={`Analysis image ${i + 1}`}
                  width={80}
                  height={80}
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                />
              </a>
            ))}
          </div>
        )}
        {photoHistoryHref && totalPhotoCount > 0 && (
          <div className="pt-1">
            <Link
              href={photoHistoryHref}
              className="inline-flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800 font-medium"
            >
              <Images className="w-4 h-4" />
              View photo history ({totalPhotoCount})
            </Link>
          </div>
        )}
      </div>

      {analyses.length > 1 && (
        <details className="bg-white border border-gray-200 rounded-xl mb-8">
          <summary className="px-5 py-4 text-sm text-gray-500 cursor-pointer font-medium select-none list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span className="details-arrow">▶</span>
            {analyses.length - 1} past analysis{analyses.length - 1 > 1 ? "es" : ""}
          </summary>
          <div className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-3">
            {analyses.slice(1).map((a) => (
              <div key={a.id} className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-bold ${colorForScore(a.healthScore)}`}>
                    {a.healthScore}
                  </span>
                  <span className="text-xs text-gray-400">/ 100</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {format(a.createdAt, "MMM d, yyyy")}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{a.summary}</p>
                {a.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.issues.map((issue) => (
                      <span
                        key={issue}
                        className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5"
                      >
                        {issue}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
