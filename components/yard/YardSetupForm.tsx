"use client";

import { Button } from "@/components/ui/button";
import NotInApp from "@/components/NotInApp";
import { STEP_LABELS, useYardSetup } from "./setup/useYardSetup";
import { PropertyStep } from "./setup/PropertyStep";
import { AreaStep } from "./setup/AreaStep";
import { GrassStep } from "./setup/GrassStep";
import { SoilStep } from "./setup/SoilStep";
import { PhotosStep } from "./setup/PhotosStep";
import { ReviewStep } from "./setup/ReviewStep";
import { SuccessScreen } from "./setup/SuccessScreen";

export function YardSetupForm() {
  const c = useYardSetup();

  if (c.showSuccess) {
    return (
      <div className="max-w-2xl">
        <SuccessScreen c={c} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex gap-1 mb-8">
        {c.activeSteps.map((stepNum, idx) => (
          <div
            key={stepNum}
            className={`flex-1 h-2 rounded-full transition-colors ${idx <= c.activeStepIdx ? "bg-green-500" : "bg-gray-200"}`}
          />
        ))}
      </div>
      <h2 className="text-xl font-semibold mb-1">{STEP_LABELS[c.step]}</h2>
      <p className="text-sm text-gray-400 mb-4">All details can be updated later.</p>

      <form
        onSubmit={(e) => {
          // Submission only happens via the Save button's onClick - see below.
          // This blocks every native submit path (stray Enter, autofill, etc.)
          // from skipping the Review step.
          e.preventDefault();
        }}
      >
        {c.error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 flex items-start justify-between gap-3">
            <span>{c.error}</span>
            {c.yardLimitReached && (
              <NotInApp>
                <a href="/pricing" className="shrink-0 underline font-semibold hover:text-red-800 whitespace-nowrap">
                  View plans
                </a>
              </NotInApp>
            )}
          </div>
        )}

        {c.step === 0 && <PropertyStep c={c} />}
        {c.step === 1 && <AreaStep c={c} />}
        {c.step === 2 && <GrassStep c={c} />}
        {c.step === 3 && <SoilStep c={c} />}
        {/* PhotosStep stays mounted so the photoUploadRef (and the user's
            selected photos) survive navigating between steps. The actual
            content is only visible when on step 4. */}
        <div className={c.step === 4 ? "" : "hidden"}>
          <PhotosStep c={c} />
        </div>
        {c.step === 5 && <ReviewStep c={c} />}

        {c.step === 4 && c.setupPhotoCount === 0 && (
          <p className="mt-6 text-sm text-red-600 text-right">Add at least one photo to continue.</p>
        )}
        <div className="flex justify-between mt-3">
          {c.activeStepIdx > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => c.setStep(c.activeSteps[c.activeStepIdx - 1])}
            >
              Back
            </Button>
          ) : (
            <div />
          )}
          {c.activeStepIdx < c.activeSteps.length - 1 ? (
            <Button
              type="button"
              disabled={c.step === 4 && c.setupPhotoCount === 0}
              onClick={async () => { if (await c.canAdvance()) c.setStep(c.activeSteps[c.activeStepIdx + 1]); }}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              Next
            </Button>
          ) : (
            <Button
              type="button"
              disabled={
                c.isSubmitting ||
                c.postSaveStatus !== "idle" ||
                !c.saveArmed
              }
              onClick={c.handleSubmit(c.onSubmit, c.onInvalid)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 shadow-sm disabled:opacity-50"
            >
              {c.postSaveStatus === "saving" && "Saving…"}
              {c.postSaveStatus === "uploading" && "Uploading photos…"}
              {c.postSaveStatus === "analyzing" && "Analyzing your lawn…"}
              {c.postSaveStatus === "idle" &&
                (!c.saveArmed ? "Review above…" : "Save & analyze")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
