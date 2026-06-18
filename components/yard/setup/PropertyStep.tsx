"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { YardSetupController } from "./useYardSetup";

export function PropertyStep({ c }: { c: YardSetupController }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Yard Name</Label>
        <Input value={c.propertyName} onChange={(e) => c.setPropertyName(e.target.value)} placeholder="My Home" />
      </div>
      <div className="space-y-1">
        <Label>ZIP Code *</Label>
        <Input
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="90210"
          maxLength={5}
          value={c.zipCode}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 5);
            c.setZipCode(digits);
            if (c.zipVerifiedFor && c.zipVerifiedFor !== digits) {
              c.setZipVerifiedFor(null);
              c.setZipCity(null);
            }
            if (c.zipError) c.setZipError(null);
          }}
          onBlur={() => {
            if (c.zipCode.length === 0) return;
            if (c.zipCode.length < 5) {
              c.setZipError("ZIP code must be 5 digits");
              return;
            }
            c.verifyZip(c.zipCode);
          }}
        />
        {c.zipChecking && <p className="text-sm text-gray-400">Checking ZIP…</p>}
        {!c.zipChecking && c.zipCity && c.zipVerifiedFor === c.zipCode && (
          <p className="text-sm text-green-700">{c.zipCity}</p>
        )}
        {c.zipError && <p className="text-sm text-red-500">{c.zipError}</p>}
      </div>
      <div className="space-y-2 pt-2">
        <Label>How would you like to set this up?</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => c.handleSetupModeChange("whole")}
            className={cn(
              "rounded-lg border-2 p-3 text-left transition-all",
              c.setupMode === "whole"
                ? "border-green-600 bg-green-50"
                : "border-gray-200 bg-white hover:border-green-400",
            )}
          >
            <div className={cn("font-medium text-sm", c.setupMode === "whole" ? "text-green-900" : "text-gray-800")}>
              Whole yard
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Quickest. One plan for the entire lawn.
            </div>
          </button>
          <button
            type="button"
            onClick={() => c.handleSetupModeChange("sections")}
            className={cn(
              "rounded-lg border-2 p-3 text-left transition-all",
              c.setupMode === "sections"
                ? "border-green-600 bg-green-50"
                : "border-gray-200 bg-white hover:border-green-400",
            )}
          >
            <div className={cn("font-medium text-sm", c.setupMode === "sections" ? "text-green-900" : "text-gray-800")}>
              By section
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Different grass or care for front, back, side, etc.
            </div>
          </button>
        </div>
        <p className="text-xs text-gray-400">You can split your yard into sections later either way.</p>
      </div>
    </div>
  );
}
