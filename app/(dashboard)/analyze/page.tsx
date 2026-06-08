"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PhotoUpload } from "@/components/analysis/PhotoUpload";
import { AnalysisResults } from "@/components/analysis/AnalysisResults";
import type { AnalysisResult, AreaType } from "@/types";
import { Loader2, ArrowRight, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";

interface YardSection { id: string; name: string; areaType: string | null; grassType: string; analyses: { healthScore: number }[]; }
interface Yard { id: string; name: string; zipCode: string; sections: YardSection[]; }

export default function AnalyzePage() {
  const searchParams = useSearchParams();
  const [yards, setYards] = useState<Yard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYardId, setSelectedYardId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/yard")
      .then((r) => r.json())
      .then((data: Yard[]) => {
        if (!Array.isArray(data)) return;
        setYards(data);
        const preselect = searchParams.get("sectionId");
        if (preselect) {
          const yard = data.find((y) => y.sections.some((s) => s.id === preselect));
          if (yard) { setSelectedYardId(yard.id); setSelectedSectionId(preselect); }
        } else if (data.length === 1) {
          setSelectedYardId(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [searchParams]);

  const selectedYard = yards.find((y) => y.id === selectedYardId) ?? null;

  function handleYardSelect(yardId: string) {
    if (yardId === selectedYardId) return;
    setSelectedYardId(yardId);
    setSelectedSectionId("");
    setResult(null);
    setAnalysisError(null);
  }

  async function handleUploaded(urls: string[]) {
    if (!selectedSectionId) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalyzing(true);
    setResult(null);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: selectedSectionId, imageUrls: urls }),
        signal: controller.signal,
      });
      if (!res.ok) {
        setAnalysisError("Analysis failed. Please try again.");
        return;
      }
      const data = await res.json();
      setResult(data.result);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setAnalysisError("Network error. Please check your connection.");
    } finally {
      setAnalyzing(false);
      abortRef.current = null;
    }
  }

  function cancelAnalysis() {
    abortRef.current?.abort();
    setAnalyzing(false);
    setAnalysisError(null);
  }

  return (
    <div className="container max-w-2xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-green-700">Analyze Your Lawn</h1>
          <p className="text-gray-500 mt-1">Upload photos and get AI-powered diagnosis and recommendations.</p>
        </div>
        <Link href="/yard/setup">
          <Button className="bg-green-600 hover:bg-green-700 shrink-0">
            <Plus className="w-4 h-4" />Add Yard
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading your yards…</span>
        </div>
      ) : yards.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p>Set up a yard first before analyzing.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Step 1: yard picker — only shown when multiple yards */}
          {yards.length > 1 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Which yard?</p>
              <div className="flex gap-3 flex-wrap">
                {yards.map((yard) => {
                  const sel = yard.id === selectedYardId;
                  return (
                    <button
                      key={yard.id}
                      type="button"
                      onClick={() => handleYardSelect(yard.id)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border-2 px-4 py-2.5 text-left transition-all",
                        sel ? "border-green-600 bg-green-50" : "border-gray-200 bg-white hover:border-green-400"
                      )}
                    >
                      <span className={cn("font-medium text-sm", sel ? "text-green-900" : "text-gray-800")}>
                        {yard.name}
                      </span>
                      <span className="text-xs text-gray-400">ZIP {yard.zipCode}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: section picker — shown once a yard is selected */}
          {selectedYard && selectedYard.sections.length === 0 && (
            <Card className="mb-6">
              <CardContent className="p-6 text-center text-gray-500">
                <p>This yard has no sections yet. Add one from My Yards.</p>
              </CardContent>
            </Card>
          )}
          {selectedYard && selectedYard.sections.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Which section are you photographing?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {selectedYard.sections.map((s) => {
                  const areaCfg = s.areaType ? AREA_CONFIG[s.areaType as AreaType] : null;
                  const Icon = areaCfg?.icon;
                  const sel = selectedSectionId === s.id;
                  const score = s.analyses[0]?.healthScore ?? null;
                  const scoreColor = score === null ? "" : score >= 75 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-500";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSelectedSectionId(s.id); setResult(null); setAnalysisError(null); }}
                      className={cn(
                        "flex flex-col items-start rounded-lg border-2 px-3 py-2.5 text-left transition-all",
                        sel ? "border-green-600 bg-green-50" : "border-gray-200 bg-white hover:border-green-400"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {Icon && <Icon className={cn("w-3.5 h-3.5 shrink-0", sel ? "text-green-700" : "text-gray-400")} />}
                        <span className={cn("font-medium text-sm", sel ? "text-green-900" : "text-gray-800")}>
                          {s.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-400 capitalize">
                          {s.grassType.replace(/_/g, " ")}
                        </span>
                        {score !== null && (
                          <span className={cn("text-xs font-semibold", scoreColor)}>{score}/100</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedSectionId && <PhotoUpload onUploaded={handleUploaded} analyzing={analyzing} onReset={cancelAnalysis} />}

          {analyzing && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin text-green-500" />
                <span>Analyzing… this usually takes 20–40 seconds</span>
              </div>
              <button
                onClick={cancelAnalysis}
                className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                Cancel and change photos
              </button>
            </div>
          )}
          {analysisError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 mt-4">{analysisError}</div>
          )}
          {result && (
            <div className="mt-6 space-y-4">
              <Link href={`/yard/${selectedYardId}/sections/${selectedSectionId}`}>
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  <ArrowRight className="w-4 h-4 mr-2" /> View Full Plan &amp; Tasks
                </Button>
              </Link>
              <AnalysisResults result={result} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
