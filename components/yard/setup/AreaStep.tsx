"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AreaTypeSelector, AREA_NAME_MAP } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import type { YardSetupController } from "./useYardSetup";

export function AreaStep({ c }: { c: YardSetupController }) {
  const areaType = c.watch("areaType") as AreaType | undefined;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Which part of your yard are we setting up?</p>
      <AreaTypeSelector
        value={areaType}
        onChange={(v) => {
          c.setValue("areaType", v);
          const defaultNames = new Set(Object.values(AREA_NAME_MAP));
          const cur = c.watch("name");
          if (!cur || defaultNames.has(cur)) c.setValue("name", AREA_NAME_MAP[v]);
        }}
      />
      <div className="space-y-1">
        <Label>Section Name</Label>
        <Input
          placeholder="Front Yard"
          value={c.watch("name") ?? ""}
          onChange={(e) => c.setValue("name", e.target.value)}
        />
      </div>
    </div>
  );
}
