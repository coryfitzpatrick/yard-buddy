import { CheckCircle2, Circle } from "lucide-react";
import NotInApp from "@/components/NotInApp";

interface Props {
  scheduleSet: boolean;
  taskCompleted: boolean;
  bonusAlreadyGranted: boolean;
  bonusGrantedAt?: Date | null;
  trialEndsAt: Date | null;
}

const CELEBRATION_WINDOW_MS = 24 * 3600 * 1000;

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function TrialProgressCard({
  scheduleSet,
  taskCompleted,
  bonusAlreadyGranted,
  bonusGrantedAt,
  trialEndsAt,
}: Props) {
  // Hide once the 24h celebration window has passed.
  if (bonusAlreadyGranted && bonusGrantedAt) {
    const ageMs = Date.now() - bonusGrantedAt.getTime();
    if (ageMs > CELEBRATION_WINDOW_MS) return null;
  }

  // Celebration state
  if (bonusAlreadyGranted) {
    return (
      <NotInApp>
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm font-semibold text-green-800">
            🎉 You earned 7 more trial days
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            {trialEndsAt ? <>Trial now ends {formatDate(trialEndsAt)}.</> : "Trial extended by 7 days."}
          </p>
        </div>
      </NotInApp>
    );
  }

  const projectedEnd = trialEndsAt
    ? new Date(trialEndsAt.getTime() + 7 * 86400 * 1000)
    : null;

  return (
    <NotInApp>
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-2">
        <p className="text-sm font-semibold text-emerald-900">
          🌱 Earn 7 more trial days
        </p>
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-start gap-2">
            {scheduleSet
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              : <Circle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />}
            <span className={scheduleSet ? "text-emerald-900" : "text-emerald-800"}>
              <span className="sr-only">{scheduleSet ? "Completed: " : "Not completed: "}</span>
              {scheduleSet
                ? "Schedule set"
                : "Set a watering or mowing schedule"}
            </span>
          </li>
          <li className="flex items-start gap-2">
            {taskCompleted
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              : <Circle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />}
            <span className={taskCompleted ? "text-emerald-900" : "text-emerald-800"}>
              <span className="sr-only">{taskCompleted ? "Completed: " : "Not completed: "}</span>
              {taskCompleted
                ? "Task completed"
                : "Complete a task, mark any task done from your yard tasks list"}
            </span>
          </li>
        </ul>
        {projectedEnd && (
          <p className="text-xs text-emerald-700">
            Complete both to extend your trial to {formatDate(projectedEnd)}.
          </p>
        )}
      </div>
    </NotInApp>
  );
}
