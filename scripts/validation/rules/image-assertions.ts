import type { ImageScenario, ImageRule, ImageRuleResult } from "../types-image";

function pass(ruleId: string, scenario: ImageScenario): ImageRuleResult {
  return { ruleId, scenarioId: scenario.id, pass: true, reason: "Rule does not apply or passed" };
}
function fail(ruleId: string, scenario: ImageScenario, reason: string): ImageRuleResult {
  return { ruleId, scenarioId: scenario.id, pass: false, reason };
}

const healthyLawnMaintenanceOnly: ImageRule = {
  id: "healthy-lawn-maintenance-only",
  description: "When ground truth says healthy, ALL recommendations must use a permitted taskMode (maintenance or improvement; corrective is forbidden).",
  check(scenario, json) {
    if (!scenario.groundTruth.issues.includes("healthy")) return pass(this.id, scenario);
    if (!scenario.groundTruth.taskModeConstraint) return pass(this.id, scenario);
    const allowed = new Set(scenario.groundTruth.taskModeConstraint);
    try {
      const result = JSON.parse(json) as { recommendations?: Array<{ taskMode?: string; title?: string }> };
      const recs = result.recommendations ?? [];
      for (const rec of recs) {
        if (!rec.taskMode || !allowed.has(rec.taskMode as 'maintenance' | 'corrective' | 'improvement')) {
          return fail(this.id, scenario, `Recommendation "${rec.title ?? '(untitled)'}" has taskMode "${rec.taskMode ?? '(unset)'}" but only ${scenario.groundTruth.taskModeConstraint.join("/")} are allowed for healthy lawns`);
        }
      }
      return pass(this.id, scenario);
    } catch {
      return fail(this.id, scenario, "AI output JSON parse failed");
    }
  },
};

const mustNotIncludeBlocked: ImageRule = {
  id: "must-not-include-blocked",
  description: "Output text must not contain any phrase in groundTruth.mustNotInclude.",
  check(scenario, json) {
    const text = json.toLowerCase();
    for (const phrase of scenario.groundTruth.mustNotInclude) {
      if (text.includes(phrase.toLowerCase())) {
        return fail(this.id, scenario, `Output contains forbidden phrase "${phrase}"`);
      }
    }
    return pass(this.id, scenario);
  },
};

const mustIncludeRequired: ImageRule = {
  id: "must-include-required",
  description: "Output text must contain every phrase in groundTruth.mustInclude.",
  check(scenario, json) {
    const text = json.toLowerCase();
    for (const phrase of scenario.groundTruth.mustInclude) {
      if (!text.includes(phrase.toLowerCase())) {
        return fail(this.id, scenario, `Output missing required phrase "${phrase}"`);
      }
    }
    return pass(this.id, scenario);
  },
};

const dataGapWarningPresent: ImageRule = {
  id: "data-gap-warning-present",
  description: "When dataGaps are non-empty, AI must emit a non-null dataGapWarning string.",
  check(scenario, json) {
    if (scenario.dataGaps.length === 0) return pass(this.id, scenario);
    try {
      const result = JSON.parse(json) as { dataGapWarning?: string | null };
      if (result.dataGapWarning && typeof result.dataGapWarning === 'string' && result.dataGapWarning.trim().length > 0) {
        return pass(this.id, scenario);
      }
      return fail(this.id, scenario, `Scenario has ${scenario.dataGaps.length} dataGaps but dataGapWarning is null/empty`);
    } catch {
      return fail(this.id, scenario, "AI output JSON parse failed");
    }
  },
};

export const IMAGE_RULES: ImageRule[] = [
  healthyLawnMaintenanceOnly,
  mustNotIncludeBlocked,
  mustIncludeRequired,
  dataGapWarningPresent,
];
