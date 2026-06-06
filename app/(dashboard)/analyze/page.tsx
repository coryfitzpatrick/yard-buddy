"use client";

import { useState, useEffect } from "react";
import { PhotoUpload } from "@/components/analysis/PhotoUpload";
import { AnalysisResults } from "@/components/analysis/AnalysisResults";
import { AnalysisResult } from "@/types";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface YardProfile { id: string; name: string; grassType: string; zipCode: string; }

export default function AnalyzePage() {
  const [profiles, setProfiles] = useState<YardProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    fetch("/api/yard").then((r) => r.json()).then((data) => {
      setProfiles(data);
      if (data.length > 0) setSelectedProfileId(data[0].id);
    });
  }, []);

  async function handleUploaded(urls: string[]) {
    if (!selectedProfileId) return;
    setAnalyzing(true);
    setResult(null);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: selectedProfileId, imageUrls: urls }),
    });
    const data = await res.json();
    setResult(data.result);
    setAnalyzing(false);
  }

  return (
    <div className="container max-w-2xl py-8 px-4">
      <h1 className="text-3xl font-bold text-green-700 mb-1">Analyze Your Lawn</h1>
      <p className="text-gray-500 mb-6">Upload photos and get AI-powered diagnosis and recommendations.</p>

      {profiles.length > 1 && (
        <div className="mb-4">
          <Select value={selectedProfileId} onValueChange={(v) => { if (v) setSelectedProfileId(v); }}>
            <SelectTrigger><SelectValue placeholder="Select yard" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p>Set up a yard profile first before analyzing photos.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <PhotoUpload onUploaded={handleUploaded} />
          {analyzing && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin text-green-500" />
              <span>Analyzing your lawn... this takes about 10 seconds</span>
            </div>
          )}
          {result && <div className="mt-6"><AnalysisResults result={result} /></div>}
        </>
      )}
    </div>
  );
}
