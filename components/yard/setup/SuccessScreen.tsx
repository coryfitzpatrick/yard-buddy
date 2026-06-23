"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle2, Plus } from "lucide-react";
import type { YardSetupController } from "./useYardSetup";

export function SuccessScreen({ c }: { c: YardSetupController }) {
  return (
    <div className="text-center space-y-6 py-8">
      {c.error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 text-left">
          {c.error}
        </div>
      )}
      <CheckCircle2 className="mx-auto w-16 h-16 text-green-500" />
      <div>
        <h3 className="text-xl font-semibold text-gray-900">
          {c.addingAnotherSection ? "Section added!" : "Yard set up!"}
        </h3>
        <p className="text-gray-500 mt-1">
          {c.analyzedSectionSlug ? (
            <><span className="font-medium">{c.createdPropertyName}</span> is set up and your photos have been analyzed.</>
          ) : c.addingAnotherSection ? (
            <><span className="font-medium">{c.createdPropertyName}</span> has a new section ready to analyze.</>
          ) : (
            <><span className="font-medium">{c.createdPropertyName}</span> is ready. Upload photos any time to get a custom plan, or split it into sections later.</>
          )}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button type="button" variant="outline" onClick={c.handleAddAnotherSection}>
          <Plus className="w-4 h-4 mr-2" /> Add Section
        </Button>
        {c.analyzedSectionSlug && c.createdYardSlug ? (
          <Button
            type="button"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => c.router.push(`/yard/${c.createdYardSlug}/sections/${c.analyzedSectionSlug}`)}
          >
            View analysis
          </Button>
        ) : (
          <Button
            type="button"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => c.router.push("/dashboard")}
          >
            Go to Dashboard
          </Button>
        )}
      </div>
    </div>
  );
}
