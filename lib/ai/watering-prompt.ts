export interface WateringPromptOpts {
  grassType: string;
  areaType?: string | null;
  yardSizeSqft?: number | null;
  soilPh?: number | null;
  soilMoisture?: string | null;
  notes?: string | null;
  zipCode: string;
  wateringDaysPerWeek?: number | null;
  wateringMinutesPerSession?: number | null;
  weatherSummary?: string;
}

export function buildWateringPrompt(opts: WateringPromptOpts): string {
  const lines: string[] = [
    `Grass type: ${opts.grassType.replace(/_/g, " ")}`,
    `ZIP code: ${opts.zipCode}`,
  ];
  if (opts.areaType) lines.push(`Area type: ${opts.areaType.replace(/_/g, " ")}`);
  if (opts.yardSizeSqft) lines.push(`Section size: ${opts.yardSizeSqft.toLocaleString()} sq ft`);
  if (opts.soilPh != null) lines.push(`Soil pH: ${opts.soilPh}`);
  if (opts.soilMoisture) lines.push(`Soil moisture: ${opts.soilMoisture}`);
  if (opts.weatherSummary) lines.push(`Current weather: ${opts.weatherSummary}`);
  if (opts.notes) lines.push(`Notes: ${opts.notes}`);

  const sectionDetails = lines.join("\n");

  const scheduleContext =
    opts.wateringDaysPerWeek != null && opts.wateringMinutesPerSession != null
      ? `Current yard watering schedule: ${opts.wateringDaysPerWeek} day(s) per week, ${opts.wateringMinutesPerSession} minutes per session.\nAssess whether this schedule suits this specific section. Consider grass type, soil drainage, shade, and local climate. Set "deviates" to true only if a meaningfully different schedule is warranted.`
      : `No yard watering schedule has been set. Recommend an appropriate schedule for this section based on its properties and local climate. Set "deviates" to false since there is no default to deviate from.`;

  return [
    sectionDetails,
    "",
    scheduleContext,
    "",
    `Return JSON only — no markdown, no explanation outside the JSON:`,
    `{"schedule": "...", "deviates": true|false}`,
    `"schedule": 1-2 sentence natural language recommendation. If the existing schedule works, affirm it briefly. If not, specify the change and why.`,
    `"deviates": true only if recommending a meaningfully different schedule from the yard default.`,
  ].join("\n");
}
