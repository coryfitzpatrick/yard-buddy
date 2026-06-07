"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TaskList } from "./TaskList";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskSection {
  id: string;
  name: string;
  yardName: string;
  showYardLabel: boolean;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  product?: string | null;
  applicationRate?: string | null;
  spreaderSetting?: string | null;
  yardSection?: {
    id: string;
    name: string;
    areaType: string | null;
    yard: { name: string };
  } | null;
}

interface Props {
  tasks: Task[];
  sections: TaskSection[];
}

export function DashboardTaskSection({ tasks, sections }: Props) {
  const [activeSection, setActiveSection] = useState<"all" | string>("all");

  const filteredTasks =
    activeSection === "all"
      ? tasks
      : tasks.filter((t) => t.yardSection?.id === activeSection);

  const multiYard = sections.some((s) => s.showYardLabel);

  return (
    <div>
      {sections.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setActiveSection("all")}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors",
              activeSection === "all"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            All
          </button>
          {sections.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors whitespace-nowrap",
                activeSection === sec.id
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {sec.showYardLabel ? `${sec.yardName}: ${sec.name}` : sec.name}
            </button>
          ))}
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-gray-500 mb-3">No tasks yet. Analyze a section to get started.</p>
            <Link href="/analyze">
              <Button className="bg-green-600 hover:bg-green-700">
                <Camera className="mr-2 w-4 h-4" /> Analyze My Lawn
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <TaskList
          tasks={filteredTasks}
          multiYard={multiYard && activeSection === "all"}
        />
      )}
    </div>
  );
}
