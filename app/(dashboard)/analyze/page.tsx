"use client";

import { useState, useEffect } from "react";
import { PhotoUpload } from "@/components/analysis/PhotoUpload";
import { AnalysisResults } from "@/components/analysis/AnalysisResults";
import { AnalysisResult } from "@/types";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface YardSection { id: string; name: string; areaType: string | null; grassType: string; }
interface Yard { id: string; name: string; zipCode: string; sections: YardSection[]; }

export default function AnalyzePage() {
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    fetch("/api/yard")
      .then((r) => r.json())
      .then((data: Yard[]) => {
        if (!Array.isArray(data)) return;
        setYards(data);
        if (data.length > 0) {
          setSelectedYardId(data[0].id);
          if (data[0].sections.length > 0) setSelectedSectionId(data[0].sections[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const selectedYard = yards.find((y) => y.id === selectedYardId);
  const sections = selectedYard?.sections ?? [];

  function handleYardChange(yardId: string) {
    setSelectedYardId(yardId);
    setSelectedSectionId("");
    setResult(null);
    const yard = yards.find((y) => y.id === yardId);
    if (yard?.sections.length) setSelectedSectionId(yard.sections[0].id);
  }

  async function handleUploaded(urls: string[]) {
    if (!selectedSectionId) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: selectedSectionId, imageUrls: urls }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setResult(data.result);
    } finally {
      setAnalyzing(false);
    }
  }

  const hasNoYards = yards.length === 0;
  const hasNoSections = !hasNoYards && sections.length === 0;
  const readyToAnalyze = !!selectedSectionId;

  return (
    <div className="container max-w-2xl py-8 px-4">
      <h1 className="text-3xl font-bold text-green-700 mb-1">Analyze Your Lawn</h1>
      <p className="text-gray-500 mb-6">Upload photos and get AI-powered diagnosis and recommendations.</p>

      {hasNoYards ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p>Set up a yard first before analyzing.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {yards.length > 1 && (
              <div className="space-y-1">
                <Label>Property</Label>
                <Select value={selectedYardId} onValueChange={(v) => v && handleYardChange(v)}>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {yards.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Yard Section</Label>
              {hasNoSections ? (
                <p className="text-sm text-gray-400">No sections in this yard. Add one first.</p>
              ) : (
                <Select value={selectedSectionId} onValueChange={(v) => { if (v) { setSelectedSectionId(v); setResult(null); } }}>
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.areaType ? ` (${s.areaType.replace(/_/g, " ")})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {readyToAnalyze && <PhotoUpload onUploaded={handleUploaded} />}

          {analyzing && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin text-green-500" />
              <span>Analyzing… this takes about 10 seconds</span>
            </div>
          )}
          {result && <div className="mt-6"><AnalysisResults result={result} /></div>}
        </>
      )}
    </div>
  );
}
