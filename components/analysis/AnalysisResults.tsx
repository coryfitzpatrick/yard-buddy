"use client";

import { AnalysisResult } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, Clock } from "lucide-react";

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

const ISSUE_LABEL: Record<string, string> = {
  grubs: "Grub Damage",
  weeds_broadleaf: "Broadleaf Weeds",
  weeds_grassy: "Grassy Weeds",
  fungus: "Fungal Disease",
  drought_stress: "Drought Stress",
  overwatering: "Overwatering",
  bare_spots: "Bare Spots",
  thatch: "Excess Thatch",
  compaction: "Soil Compaction",
  nutrient_deficiency: "Nutrient Deficiency",
  pests: "Pest Damage",
  healthy: "Healthy",
};

export function AnalysisResults({ result }: { result: AnalysisResult }) {
  const scoreColor = result.healthScore >= 70 ? "text-green-600" : result.healthScore >= 40 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Lawn Health Score
            <span className={`text-4xl font-bold ${scoreColor}`}>{result.healthScore}/100</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={result.healthScore} className="h-3 mb-3" />
          <p className="text-sm text-gray-600">{result.summary}</p>
          {result.issues.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {result.issues.map((issue) => (
                <Badge key={issue} variant="outline" className={issue === "healthy" ? "border-green-300 text-green-700" : "border-orange-300 text-orange-700"}>
                  {issue === "healthy" ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                  {ISSUE_LABEL[issue] ?? issue}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="font-semibold text-lg mb-3">Recommendations</h3>
        <div className="space-y-3">
          {result.recommendations.map((rec, i) => (
            <Card key={i} className="border-l-4" style={{ borderLeftColor: rec.priority === "urgent" ? "#ef4444" : rec.priority === "high" ? "#f97316" : rec.priority === "medium" ? "#eab308" : "#22c55e" }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-medium text-sm">{rec.title}</h4>
                  <Badge variant="outline" className={`text-xs shrink-0 ${PRIORITY_COLOR[rec.priority]}`}>
                    {rec.priority}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mb-2">{rec.description}</p>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" /> {rec.timing}
                </div>
                {rec.productSuggestion && (
                  <div className="mt-2 text-xs bg-gray-50 rounded p-2 space-y-1">
                    <div><span className="font-medium">Product:</span> {rec.productSuggestion}</div>
                    {rec.applicationRate && <div><span className="font-medium">Rate:</span> {rec.applicationRate}</div>}
                    {rec.spreaderSetting && <div><span className="font-medium">Setting:</span> {rec.spreaderSetting}</div>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
