import type { LawnContext } from "../../lib/claude";
import type { GrassType, LawnIssue } from "../../types";
import type { DataGapField } from "../../lib/claude";

export type AnalysisIssue = LawnIssue;

export type TaskMode = 'corrective' | 'maintenance' | 'improvement';

export type ImagePhotoRef = {
  path: string;
  license: 'public-domain' | 'cc-by-4.0' | 'usda-public-domain' | 'extension-educational-use';
  source: string;
  caption?: string;
};

export type ImageScenario = {
  id: string;
  description: string;
  photos: ImagePhotoRef[];
  profile: LawnContext;
  dataGaps: DataGapField[];
  groundTruth: {
    grassType: GrassType;
    issues: AnalysisIssue[];
    healthScoreRange: [number, number];
    mustInclude: string[];
    mustNotInclude: string[];
    photoNotes: string;
    taskModeConstraint?: TaskMode[];
  };
};

export type ImageJudgeResult = {
  scenarioId: string;
  grassTypeAccuracy: number;
  issuesF1: number;
  healthScoreInRange: number;
  recommendationQuality: number;
  dataGapAcknowledgment: number;
  crossPhotoSynthesis: number | null;
  combined: number;
  flags: string[];
  reasoning: string;
};

export type ImageRuleResult = {
  ruleId: string;
  scenarioId: string;
  pass: boolean;
  reason: string;
};

export type ImageRule = {
  id: string;
  description: string;
  check: (scenario: ImageScenario, aiResultJson: string) => ImageRuleResult;
};

export type ImageRunReport = {
  timestamp: string;
  pillar2Results: ImageRuleResult[];
  pillar3Results: ImageJudgeResult[];
  pillar3Mean: number;
  pillar3DimensionMeans: {
    grassTypeAccuracy: number;
    issuesF1: number;
    healthScoreInRange: number;
    recommendationQuality: number;
    dataGapAcknowledgment: number;
    crossPhotoSynthesis: number;
  };
  overallPass: boolean;
  failures: string[];
};

export function computeCombinedScore(r: Omit<ImageJudgeResult, 'combined' | 'scenarioId' | 'flags' | 'reasoning'>): number {
  const hasCross = r.crossPhotoSynthesis != null;
  if (hasCross) {
    return Math.round(
      0.15 * r.grassTypeAccuracy +
      0.20 * r.issuesF1 +
      0.10 * r.healthScoreInRange +
      0.35 * r.recommendationQuality +
      0.10 * r.dataGapAcknowledgment +
      0.10 * (r.crossPhotoSynthesis as number)
    );
  }
  return Math.round(
    (0.15 * r.grassTypeAccuracy +
     0.20 * r.issuesF1 +
     0.10 * r.healthScoreInRange +
     0.35 * r.recommendationQuality +
     0.10 * r.dataGapAcknowledgment) / 0.90
  );
}
