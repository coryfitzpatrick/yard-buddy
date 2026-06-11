"use client";

import { useState } from "react";
import {
  buildWeeks,
  computeGridRange,
  sectionColor,
  getBarPosition,
  COLOR_CLASSES,
  type CalendarTask,
} from "@/lib/calendar-utils";
import { CalendarToolbar } from "./CalendarToolbar";
import { TaskPopover } from "./TaskPopover";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  tasks: CalendarTask[];
  month: string;
  gridStart: string;
  yards: { id: string; slug: string; name: string; sections: { id: string; slug: string; name: string }[] }[];
  selectedYard: string;
  selectedSection: string;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function taskOverlapsWeek(task: CalendarTask, weekDays: Date[]): boolean {
  const start = new Date(task.scheduledStart);
  const end = new Date(task.scheduledEnd);
  return start <= weekDays[6] && end >= weekDays[0];
}

export function MonthCalendar({ tasks, month, gridStart, yards, selectedYard, selectedSection }: Props) {
  const [activeTask, setActiveTask] = useState<CalendarTask | null>(null);
  const [activeBarId, setActiveBarId] = useState<string | null>(null);

  const { gridEnd } = computeGridRange(month);
  const weeks = buildWeeks(new Date(gridStart), gridEnd);
  const today = new Date();

  const [year, mon] = month.split("-").map(Number);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <CalendarToolbar
        yards={yards}
        selectedYard={selectedYard}
        selectedSection={selectedSection}
        month={month}
      />

      {/* Day headers */}
      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((weekDays, wi) => {
        const weekTasks = tasks.filter((t) => taskOverlapsWeek(t, weekDays));

        return (
          <div key={wi} className="border-b border-gray-50 last:border-b-0">
            {/* Day numbers */}
            <div className="grid grid-cols-7">
              {weekDays.map((day, di) => {
                const isCurrentMonth = day.getUTCMonth() + 1 === mon && day.getUTCFullYear() === year;
                const isToday = isSameDay(day, today);
                return (
                  <div key={di} className="px-2 pt-2 pb-1">
                    <span
                      className={[
                        "text-xs inline-flex w-6 h-6 items-center justify-center rounded-full",
                        isToday ? "bg-green-100 text-green-700 font-bold" : "",
                        !isCurrentMonth ? "text-gray-300" : "text-gray-700",
                      ].join(" ")}
                    >
                      {day.getUTCDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Task bars */}
            {weekTasks.length === 0 ? (
              <div className="px-3 pb-3 text-xs text-gray-300 italic">No tasks scheduled</div>
            ) : (
              <div className="px-1 pb-2 flex flex-col gap-1">
                {weekTasks.map((task) => {
                  const { startCol, colSpan, continuesBefore, continuesAfter } = getBarPosition(task, weekDays);
                  const color = sectionColor(task.sectionId);
                  const classes = COLOR_CLASSES[color];
                  const isCompleted = task.status === "completed";
                  const isSkipped = task.status === "skipped";

                  const label = continuesBefore
                    ? `← ${task.title}`
                    : continuesAfter
                    ? `${task.title} →`
                    : task.title;

                  return (
                    <div key={`${task.id}-${wi}`} className="grid grid-cols-7 relative">
                      {/* Empty cells before bar */}
                      {Array.from({ length: startCol }).map((_, i) => (
                        <div key={i} />
                      ))}
                      {/* Bar */}
                      <div
                        style={{ gridColumn: `span ${colSpan}` }}
                        className={[
                          "rounded-md px-2 py-0.5 text-xs font-medium cursor-pointer truncate transition-opacity hover:opacity-80",
                          isSkipped ? "bg-gray-100 text-gray-400" : `${classes.bg} ${classes.text}`,
                          isCompleted ? "opacity-50 line-through" : "",
                        ].join(" ")}
                        onClick={() => {
                          setActiveTask(task);
                          setActiveBarId(`${task.id}-${wi}`);
                        }}
                      >
                        {label}
                      </div>
                      {/* Popover anchored to this bar */}
                      {activeTask?.id === task.id && activeBarId === `${task.id}-${wi}` && (
                        <TaskPopover
                          task={activeTask}
                          onClose={() => { setActiveTask(null); setActiveBarId(null); }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
