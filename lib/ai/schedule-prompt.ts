export interface SchedulePromptOpts {
  grassType: string;
  areaType?: string | null;
  yardSizeSqft?: number | null;
  soilPh?: number | null;
  soilMoisture?: string | null;
  notes?: string | null;
  zipCode: string;
  wateringDaysPerWeek?: number | null;
  wateringMinutesPerSession?: number | null;
  mowingDaysPerWeek?: number | null;
  mowingHeightInches?: number | null;
  weatherSummary?: string;
}

export function buildSchedulePrompt(opts: SchedulePromptOpts): string {
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

  const wateringContext =
    opts.wateringDaysPerWeek != null && opts.wateringMinutesPerSession != null
      ? `Current watering: ${opts.wateringDaysPerWeek} day(s) per week, ${opts.wateringMinutesPerSession} minutes per session.\nAssess whether this watering schedule suits this section. Set "watering.deviates" to true only if a meaningfully different schedule is warranted.`
      : `No watering schedule has been set for this section. Recommend a watering schedule from scratch based on grass type, soil, area, and local climate. Set "watering.deviates" to false.`;

  const mowingContext =
    opts.mowingDaysPerWeek != null && opts.mowingHeightInches != null
      ? `Current mowing: ${opts.mowingDaysPerWeek} time(s) per week at ${opts.mowingHeightInches} inches.\nAssess whether this mowing schedule suits this section. Set "mowing.deviates" to true only if a meaningfully different schedule is warranted.`
      : `No mowing schedule has been set for this section. Recommend a mowing schedule from scratch (frequency and height) based on grass type and conditions. Set "mowing.deviates" to false.`;

  return [
    sectionDetails,
    "",
    wateringContext,
    "",
    mowingContext,
    "",
    `Return JSON only — no markdown, no explanation outside the JSON:`,
    `{`,
    `  "watering": {`,
    `    "schedule": "1-2 sentence natural-language recommendation",`,
    `    "deviates": true|false,`,
    `    "suggestedDaysPerWeek": integer 1-7,`,
    `    "suggestedMinutesPerSession": integer minutes`,
    `  },`,
    `  "mowing": {`,
    `    "schedule": "1-2 sentence natural-language recommendation",`,
    `    "deviates": true|false,`,
    `    "suggestedDaysPerWeek": integer 1-7,`,
    `    "suggestedHeightInches": number inches (decimals allowed, e.g. 2.5)`,
    `  }`,
    `}`,
    `"deviates" is true only when the suggested numbers meaningfully differ from the current values. If no current schedule is set, "deviates" is false and the suggested numbers become the recommended starting point.`,
  ].join("\n");
}
