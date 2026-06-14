import type { LawnContext } from "../../lib/claude";

export type Scenario = {
  id: string;
  description: string;
  profile: LawnContext;
  groundTruth: {
    mustInclude: string[];
    mustNotInclude: string[];
    source: string;
  };
};

export type RuleResult = {
  ruleId: string;
  scenarioId?: string;
  pass: boolean;
  reason: string;
};

export type Rule = {
  id: string;
  description: string;
  check: (scenario: Scenario, response: string) => RuleResult;
};

export type InputTestResult = {
  testId: string;
  pass: boolean;
  reason: string;
};

export type JudgeResult = {
  scenarioId: string;
  score: number;
  flags: string[];
  reasoning: string;
  critiqueFlags?: string[];
  revised?: boolean;
};

export type PillarResult =
  | { pillar: 1; results: InputTestResult[] }
  | { pillar: 2; results: RuleResult[] }
  | { pillar: 3; results: JudgeResult[]; mean: number };

export type RunReport = {
  timestamp: string;
  pillars: PillarResult[];
  overallPass: boolean;
  failures: string[];
};
