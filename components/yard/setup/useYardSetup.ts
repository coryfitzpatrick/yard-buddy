"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { yardSectionSchema, type YardSectionInput, type YardSectionFormInput } from "@/lib/validations/yard";
import type { PhotoUploadHandle } from "@/components/analysis/PhotoUpload";
import type { GrassIdentifyUploadHandle } from "@/components/yard/GrassIdentifyUpload";
import { toSqft, toDisplaySize } from "@/lib/size-utils";

export const STEP_LABELS: Record<number, string> = {
  0: "Property",
  1: "Area Type",
  2: "Grass Type",
  3: "Soil & Equipment",
  4: "Photos",
  5: "Review",
};
// Internal step indices for each entry path. Whole-yard flow skips Area Type -
// the auto-created section is "Whole Yard" / areaType="other". Per-section
// flows keep Area Type because picking the area is the whole point.
export const WHOLE_YARD_FLOW = [0, 2, 3, 4, 5] as const;
export const BY_SECTION_FLOW = [0, 1, 2, 3, 4, 5] as const;

export const SPREADER_BRANDS: Record<string, string[]> = {
  broadcast: ["Scotts EdgeGuard DLX", "Scotts Turf Builder EdgeGuard", "Andersons Rotary Spreader", "Lesco 80 lb Rotary", "Earthway 2600"],
  drop:      ["Scotts Snap Spreader", "Scotts Classic Drop", "Earthway 2150", "Agri-Fab 45-0462"],
  handheld:  ["Scotts Wizz", "Scotts Elite Hand Spreader", "Chapin 8701B"],
  liquid:    ["Chapin 20000", "Solo 420", "Smith Performance Sprayer", "Ortho Dial N Spray"],
  none:      [],
};

export type PostSaveStatus = "idle" | "saving" | "uploading" | "analyzing";

export function useYardSetup() {
  const router = useRouter();

  // Step + result state
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [yardLimitReached, setYardLimitReached] = useState(false);
  const [createdYardId, setCreatedYardId] = useState<string | null>(null);
  const [createdYardSlug, setCreatedYardSlug] = useState<string | null>(null);
  const [createdPropertyName, setCreatedPropertyName] = useState<string>("");
  const [postSaveStatus, setPostSaveStatus] = useState<PostSaveStatus>("idle");
  // Persist section id/slug across retries so a failed analyze doesn't
  // double-create the section when the user clicks Try again.
  const [createdSectionId, setCreatedSectionId] = useState<string | null>(null);
  const [createdSectionSlug, setCreatedSectionSlug] = useState<string | null>(null);

  // Property/zip state
  const [propertyName, setPropertyName] = useState("My Property");
  const [zipCode, setZipCode] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipChecking, setZipChecking] = useState(false);
  const [zipVerifiedFor, setZipVerifiedFor] = useState<string | null>(null);
  const [zipCity, setZipCity] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<"whole" | "sections">("whole");

  // Section form (react-hook-form)
  const form = useForm<YardSectionFormInput, unknown, YardSectionInput>({
    resolver: zodResolver(yardSectionSchema),
    defaultValues: { name: "Whole Yard", areaType: "other", grassType: "unknown" },
  });
  const { handleSubmit, watch, setValue, register, reset, trigger, formState: { errors, isSubmitting } } = form;

  // Equipment + watering state (not in RHF because they go on Yard, not Section)
  const [spreaderType, setSpreaderType] = useState<string>("");
  const [spreaderModel, setSpreaderModel] = useState<string>("");
  const [wateringDaysPerWeek, setWateringDaysPerWeek] = useState("");
  const [wateringMinutesPerSession, setWateringMinutesPerSession] = useState("");

  // Yard-size lookup state
  const [sizeUnit, setSizeUnit] = useState<"sqft" | "acres">("sqft");
  const [sizeDisplay, setSizeDisplay] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [lotData, setLotData] = useState<{ lotSqft: number | null; buildingSqft: number | null } | null>(null);

  // Photos + refs
  const [setupPhotoCount, setSetupPhotoCount] = useState(0);
  const photoUploadRef = useRef<PhotoUploadHandle | null>(null);
  const grassIdentifyRef = useRef<GrassIdentifyUploadHandle | null>(null);
  const uploadZoneRef = useRef<HTMLDivElement>(null);
  const [highlightUpload, setHighlightUpload] = useState(false);

  const activeSteps: readonly number[] =
    createdYardId || setupMode === "sections" ? BY_SECTION_FLOW : WHOLE_YARD_FLOW;
  const activeStepIdx = activeSteps.indexOf(step);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);

  // Cooldown that disables Save for a beat after Review first appears, so a
  // phantom tap from the Next click (touchend -> click landing on the newly
  // rendered Save button at the same screen position) can't auto-submit.
  // The reset on step change happens during render; the arm-after-delay is
  // the only piece that has to live in an effect.
  const [saveArmed, setSaveArmed] = useState(false);
  const [armedForStep, setArmedForStep] = useState(step);
  if (armedForStep !== step) {
    setArmedForStep(step);
    setSaveArmed(false);
  }
  useEffect(() => {
    if (step !== 5) return;
    const t = setTimeout(() => setSaveArmed(true), 1200);
    return () => clearTimeout(t);
  }, [step]);

  // Auto-verify ZIP whenever it reaches 5 digits in state. Handles autofill
  // (password managers like Bitwarden, browser address autofill) that may
  // bypass React's onChange — as long as state ends up at 5 digits, this
  // fires verify without requiring the user to leave the input first.
  useEffect(() => {
    if (zipCode.length === 5 && zipVerifiedFor !== zipCode && !zipChecking) {
      verifyZip(zipCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zipCode]);

  async function verifyZip(value: string): Promise<boolean> {
    if (zipVerifiedFor === value) return true;
    setZipChecking(true);
    setZipError(null);
    try {
      const res = await fetch(`/api/validate-zip?zip=${value}`);
      const data = await res.json();
      if (data.valid) {
        setZipVerifiedFor(value);
        setZipCity(data.city ?? null);
        return true;
      }
      setZipError(
        data.reason === "not_found"
          ? "That ZIP doesn't match a US location"
          : "Couldn't verify ZIP, try again",
      );
      setZipVerifiedFor(null);
      setZipCity(null);
      return false;
    } catch {
      setZipError("Couldn't verify ZIP, try again");
      setZipVerifiedFor(null);
      setZipCity(null);
      return false;
    } finally {
      setZipChecking(false);
    }
  }

  function handleSetupModeChange(mode: "whole" | "sections") {
    setSetupMode(mode);
    if (mode === "whole") {
      setValue("name", "Whole Yard");
      setValue("areaType", "other");
    } else {
      setValue("name", "Front Yard");
      setValue("areaType", "front");
    }
  }

  function handleSizeInput(raw: string) {
    setSizeDisplay(raw);
    setValue("yardSizeSqft", toSqft(raw, sizeUnit) as YardSectionFormInput["yardSizeSqft"]);
  }
  function handleUnitChange(next: "sqft" | "acres") {
    const cur = toSqft(sizeDisplay, sizeUnit);
    setSizeUnit(next);
    if (cur) setSizeDisplay(toDisplaySize(cur, next));
  }

  async function lookupYardSize() {
    if (!streetAddress.trim()) return;
    setLookingUp(true);
    setLookupNote(null);
    try {
      const res = await fetch("/api/lookup-yard-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: `${streetAddress}, ${zipCode}` }),
      });
      const data = await res.json();
      const sqft = data.usableSqft ?? data.lotSqft;
      if (sqft) {
        setValue("yardSizeSqft", sqft as YardSectionFormInput["yardSizeSqft"]);
        setSizeDisplay(toDisplaySize(sqft, sizeUnit));
        setLotData({ lotSqft: data.lotSqft ?? null, buildingSqft: data.buildingSqft ?? null });
        if (data.usableSqft && data.buildingSqft) {
          setLookupNote(`Lot: ~${data.lotSqft.toLocaleString()} sq ft · Home: ~${data.buildingSqft.toLocaleString()} sq ft · Lawn: ~${data.usableSqft.toLocaleString()} sq ft`);
        } else {
          setLookupNote(data.source === "parcel" ? "Lot size from parcel data" : "Estimated from map data");
        }
      } else {
        setLotData(null);
        setLookupNote(data.message ?? "Size not found. Enter manually.");
      }
    } catch {
      setLookupNote("Lookup failed. Enter manually.");
    } finally {
      setLookingUp(false);
    }
  }

  function onInvalid(formErrors: unknown) {
    console.error("yard-setup: form validation failed", formErrors);
    const messages: string[] = [];
    if (formErrors && typeof formErrors === "object") {
      for (const [field, val] of Object.entries(formErrors as Record<string, { message?: string }>)) {
        if (val?.message) messages.push(`${field}: ${val.message}`);
      }
    }
    setError(
      messages.length > 0
        ? `Validation failed — ${messages.join("; ")}`
        : "Please fill out all required fields and try again."
    );
  }

  async function onSubmit(sectionData: YardSectionInput) {
    console.log("yard-setup: onSubmit start", { sectionData });
    setError(null);
    setYardLimitReached(false);

    let yardId = createdYardId;
    let yardSlugLocal = createdYardSlug;

    if (!yardId) {
      if (!zipCode.match(/^\d{5}$/)) { setZipError("Enter a valid 5-digit ZIP code"); setStep(0); return; }
      try {
        const yardRes = await fetch("/api/yard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: propertyName,
            zipCode,
            spreaderType: spreaderType || undefined,
            spreaderModel: spreaderModel || undefined,
            streetAddress: streetAddress || undefined,
            lotSqft: lotData?.lotSqft ?? undefined,
            buildingSqft: lotData?.buildingSqft ?? undefined,
            wateringDaysPerWeek: wateringDaysPerWeek ? Number(wateringDaysPerWeek) : undefined,
            wateringMinutesPerSession: wateringMinutesPerSession ? Number(wateringMinutesPerSession) : undefined,
          }),
        });
        if (!yardRes.ok) {
          const data = await yardRes.json().catch(() => ({}));
          if (data.error === "yard_limit_reached") {
            setError(data.message);
            setYardLimitReached(true);
          } else {
            setError("Failed to save yard. Please try again.");
          }
          return;
        }
        const yard = await yardRes.json();
        yardId = yard.id;
        yardSlugLocal = yard.slug;
        setCreatedYardId(yard.id);
        setCreatedYardSlug(yard.slug);
        setCreatedPropertyName(propertyName);
      } catch {
        setError("Network error. Please check your connection.");
        return;
      }
    } else if (spreaderType || wateringDaysPerWeek || wateringMinutesPerSession) {
      try {
        await fetch(`/api/yard/${yardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: createdPropertyName || propertyName,
            zipCode,
            spreaderType: spreaderType || undefined,
            spreaderModel: spreaderModel || undefined,
            wateringDaysPerWeek: wateringDaysPerWeek ? Number(wateringDaysPerWeek) : undefined,
            wateringMinutesPerSession: wateringMinutesPerSession ? Number(wateringMinutesPerSession) : undefined,
          }),
        });
      } catch { /* best-effort yard update */ }
    }

    let createdSection: { id: string; slug: string } | null = createdSectionId && createdSectionSlug
      ? { id: createdSectionId, slug: createdSectionSlug }
      : null;
    if (!createdSection) {
      try {
        setPostSaveStatus("saving");
        const sectionRes = await fetch(`/api/yard/${yardId}/sections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sectionData),
        });
        if (!sectionRes.ok) {
          setError("Failed to save section. Please try again.");
          setPostSaveStatus("idle");
          return;
        }
        createdSection = await sectionRes.json();
        if (createdSection) {
          setCreatedSectionId(createdSection.id);
          setCreatedSectionSlug(createdSection.slug);
        }
      } catch {
        setError("Network error. Please check your connection.");
        setPostSaveStatus("idle");
        return;
      }
    }

    // If the user added photos in the Photos step, upload + analyze before
    // Upload + analyze. On success, redirect to the section page. On failure,
    // stay on the Review step so the user can fix the issue and click
    // "Save & analyze" again. Yard + section are already saved at this point;
    // the retry path skips re-creating them via createdYardId/createdSectionId.
    const hasSelection = photoUploadRef.current?.hasSelection();
    if (createdSection && hasSelection) {
      try {
        setPostSaveStatus("uploading");
        const photos = await photoUploadRef.current!.upload();
        if (photos.length === 0) {
          setError("Photos couldn't be uploaded. Tap Save & analyze again to retry.");
          setPostSaveStatus("idle");
          return;
        }
        setPostSaveStatus("analyzing");
        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionId: createdSection.id, photos }),
        });
        if (analyzeRes.ok) {
          if (yardSlugLocal) {
            router.push(`/yard/${yardSlugLocal}/sections/${createdSection.slug}`);
            return;
          }
        } else {
          const data = await analyzeRes.json().catch(() => ({}));
          setError(
            data?.message ||
            `Analysis didn't run (${analyzeRes.status}). Tap Save & analyze again to retry.`
          );
          setPostSaveStatus("idle");
          return;
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? `Analysis couldn't run: ${err.message}. Tap Save & analyze again to retry.`
            : "Analysis couldn't run. Tap Save & analyze again to retry."
        );
        setPostSaveStatus("idle");
        return;
      }
    }

    // Fallback: shouldn't reach here when the Save & analyze button is gated
    // on setupPhotoCount > 0. If we do, land them on the section page anyway.
    setPostSaveStatus("idle");
    if (yardSlugLocal && createdSection) {
      router.push(`/yard/${yardSlugLocal}/sections/${createdSection.slug}`);
    }
  }

  async function canAdvance(): Promise<boolean> {
    if (step === 0) {
      if (!zipCode.match(/^\d{5}$/)) { setZipError("Enter a valid 5-digit ZIP code"); return false; }
      if (zipVerifiedFor !== zipCode) {
        const ok = await verifyZip(zipCode);
        if (!ok) return false;
      }
      return true;
    }
    if (step === 2) return trigger(["grassType"]);
    return true;
  }

  return {
    router,

    // Step navigation
    step, setStep,
    activeSteps, activeStepIdx,
    canAdvance,
    saveArmed,

    // Form
    register, setValue, watch, trigger, handleSubmit,
    errors, isSubmitting,

    // Property / ZIP
    propertyName, setPropertyName,
    zipCode, setZipCode,
    zipError, setZipError, zipChecking, zipVerifiedFor, setZipVerifiedFor, zipCity, setZipCity,
    setupMode, handleSetupModeChange,
    verifyZip,

    // Soil / equipment
    spreaderType, setSpreaderType,
    spreaderModel, setSpreaderModel,
    wateringDaysPerWeek, setWateringDaysPerWeek,
    wateringMinutesPerSession, setWateringMinutesPerSession,

    // Yard-size lookup
    sizeUnit, sizeDisplay, handleSizeInput, handleUnitChange,
    streetAddress, setStreetAddress, lookingUp, lookupNote, lookupYardSize,

    // Photos
    setupPhotoCount, setSetupPhotoCount,
    photoUploadRef, grassIdentifyRef, uploadZoneRef,
    highlightUpload, setHighlightUpload,

    // Submission / result
    onSubmit,
    onInvalid,
    error, yardLimitReached,
    postSaveStatus,
    createdYardId, createdYardSlug, createdPropertyName,
  };
}

export type YardSetupController = ReturnType<typeof useYardSetup>;
