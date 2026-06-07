"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { yardSchema, YardInput } from "@/lib/validations/yard";
import type { z } from "zod";

type YardFormInput = z.input<typeof yardSchema>;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  yardId: string;
  initialData: { name: string; zipCode: string };
}

export function YardEditForm({ yardId, initialData }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<YardFormInput, unknown, YardInput>({
      resolver: zodResolver(yardSchema),
      defaultValues: { name: initialData.name, zipCode: initialData.zipCode },
    });

  async function onSubmit(data: YardInput) {
    setError(null);
    try {
      const res = await fetch(`/api/yard/${yardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { setError("Failed to save. Please try again."); return; }
      router.push(`/yard/${yardId}`);
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-5">
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="space-y-1">
        <Label>Property Name</Label>
        <Input placeholder="My Home" {...register("name")} />
        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>ZIP Code</Label>
        <Input placeholder="90210" maxLength={5} {...register("zipCode")} />
        {errors.zipCode && <p className="text-sm text-red-500">{errors.zipCode.message}</p>}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
