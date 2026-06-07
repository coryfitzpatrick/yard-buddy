"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TaskList } from "./TaskList";
import { SectionFilterPills } from "./SectionFilterPills";
import { Camera } from "lucide-react";

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
  scheduledStart: string | null;
  scheduledEnd: string | null;
  overdueNote: string | null;
  stillWorthDoing: boolean | null;
  product: string | null;
  applicationRate: string | null;
  spreaderSetting: string | null;
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
  weatherRefreshedAt: string | null;
}

export function DashboardTaskSection({ tasks, sections, weatherRefreshedAt }: Props) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const filteredTasks =
    activeSection === null
      ? tasks
      : tasks.filter((t) => t.yardSection?.id === activeSection);

  const multiYard = sections.some((s) => s.showYardLabel);

  const pillSections = sections.map((s) => ({
    id: s.id,
    name: s.showYardLabel ? `${s.yardName}: ${s.name}` : s.name,
  }));

  return (
    <div>
      {sections.length > 1 && (
        <div className="mb-4">
          <SectionFilterPills
            sections={pillSections}
            activeId={activeSection}
            onSelect={setActiveSection}
          />
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
        <>
          {weatherRefreshedAt && (
            <p className="text-xs text-gray-400 mb-3">
              Tasks updated{" "}
              {new Date(weatherRefreshedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}{" "}
              at{" "}
              {new Date(weatherRefreshedAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          <TaskList
            tasks={filteredTasks}
            multiYard={multiYard && activeSection === null}
          />
        </>
      )}
    </div>
  );
}
