"use client";

interface AnalysisInput {
  wateringSuggestedDaysPerWeek?: number | null;
  wateringSuggestedMinutesPerSession?: number | null;
  mowingSuggestedDaysPerWeek?: number | null;
  mowingSuggestedHeightInches?: number | null;
}

interface WateringProps {
  latestAnalysis: AnalysisInput | null;
  currentDayCount: number;
  currentMinutes: number | null;
}

interface MowingProps {
  latestAnalysis: AnalysisInput | null;
  currentDayCount: number;
  currentHeight: number | null;
}

function WarningBox({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mt-1 text-sm text-amber-900">
      {messages.map((m, i) => <p key={i}>{m}</p>)}
    </div>
  );
}

export function WateringWarning({ latestAnalysis, currentDayCount, currentMinutes }: WateringProps) {
  if (!latestAnalysis) return null;
  const suggestedDays = latestAnalysis.wateringSuggestedDaysPerWeek;
  const suggestedMin = latestAnalysis.wateringSuggestedMinutesPerSession;
  const messages: string[] = [];
  if (suggestedDays != null && currentDayCount > 0 && suggestedDays !== currentDayCount) {
    messages.push(`We recommend ${suggestedDays} day${suggestedDays === 1 ? "" : "s"} per week; you've selected ${currentDayCount}.`);
  }
  if (suggestedMin != null && currentMinutes != null && suggestedMin !== currentMinutes) {
    messages.push(`We recommend ${suggestedMin} min per session; you've entered ${currentMinutes}.`);
  }
  return <WarningBox messages={messages} />;
}

export function MowingWarning({ latestAnalysis, currentDayCount, currentHeight }: MowingProps) {
  if (!latestAnalysis) return null;
  const suggestedDays = latestAnalysis.mowingSuggestedDaysPerWeek;
  const suggestedHeight = latestAnalysis.mowingSuggestedHeightInches;
  const messages: string[] = [];
  if (suggestedDays != null && currentDayCount > 0 && suggestedDays !== currentDayCount) {
    messages.push(`We recommend ${suggestedDays} day${suggestedDays === 1 ? "" : "s"} per week; you've selected ${currentDayCount}.`);
  }
  if (suggestedHeight != null && currentHeight != null && suggestedHeight !== currentHeight) {
    messages.push(`We recommend ${suggestedHeight} inches; you've entered ${currentHeight}.`);
  }
  return <WarningBox messages={messages} />;
}
