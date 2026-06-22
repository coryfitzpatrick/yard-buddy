import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { YardEditForm } from "@/components/yard/YardEditForm";
import { SectionForm } from "@/components/yard/SectionForm";
import type { AreaType } from "@/types";
import type { YardSectionInput } from "@/lib/validations/yard";

export default async function EditYardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const [yard, subscriptionUser, latestAnalysis] = await Promise.all([
    db.yard.findFirst({
    where: { slug: id, userId: session.user.id },
    select: {
      id: true,
      name: true,
      zipCode: true,
      streetAddress: true,
      lotSqft: true,
      buildingSqft: true,
      spreaderType: true,
      spreaderModel: true,
      wateringDays: true,
      wateringTime: true,
      wateringMinutesPerSession: true,
      mowingDays: true,
      mowingTime: true,
      mowingHeightInches: true,
      sections: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          areaType: true,
          grassType: true,
          yardSizeSqft: true,
          soilPh: true,
          nitrogenPpm: true,
          phosphorusPpm: true,
          potassiumPpm: true,
          organicMatterPct: true,
          soilTestSource: true,
          soilTestedAt: true,
          soilMoisture: true,
          notes: true,
          wateringDays: true,
          wateringTime: true,
          wateringMinutesPerSession: true,
          mowingDays: true,
          mowingTime: true,
          mowingHeightInches: true,
        },
      },
    },
  }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    }),
    db.lawnAnalysis.findFirst({
      where: { yardSection: { yard: { slug: id, userId: session.user.id } } },
      orderBy: { createdAt: "desc" },
      select: {
        wateringSuggestedDaysPerWeek: true,
        wateringSuggestedMinutesPerSession: true,
        mowingSuggestedDaysPerWeek: true,
        mowingSuggestedHeightInches: true,
      },
    }),
  ]);
  if (!yard) notFound();

  // When the yard hasn't been split into sections (still just the auto-created
  // "Whole Yard" entry), we treat the lone section as part of the yard and
  // offer its fields inline so users don't have to dig into a separate editor.
  const onlySection = yard.sections.length === 1 ? yard.sections[0] : null;

  return (
    <div className="px-4 py-8">
      <Link
        href={`/yard/${id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> {yard.name}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Yard</h1>

      <YardEditForm
        yardId={yard.id}
        yardSlug={id}
        latestAnalysis={latestAnalysis}
        initialData={{
          name: yard.name,
          zipCode: yard.zipCode,
          spreaderType: yard.spreaderType ?? undefined,
          spreaderModel: yard.spreaderModel ?? undefined,
          wateringDays: yard.wateringDays,
          wateringTime: yard.wateringTime ?? null,
          wateringMinutesPerSession: yard.wateringMinutesPerSession ?? undefined,
          mowingDays: yard.mowingDays,
          mowingTime: yard.mowingTime ?? null,
          mowingHeightInches: yard.mowingHeightInches ?? undefined,
        }}
      />

      {onlySection && (
        <>
          <div className="border-t border-gray-200 my-10" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Lawn details</h2>
          <p className="text-sm text-gray-500 mb-6">
            Grass, soil, and notes for your lawn. These move with the section if you split your yard later.
          </p>
          <SectionForm
            yardId={yard.id}
            yardSlug={id}
            zipCode={yard.zipCode}
            lotSqft={yard.lotSqft ?? undefined}
            buildingSqft={yard.buildingSqft ?? undefined}
            streetAddress={yard.streetAddress ?? undefined}
            plan={subscriptionUser?.plan ?? null}
            yardWateringMinutesPerSession={yard.wateringMinutesPerSession}
            yardMowingHeightInches={yard.mowingHeightInches}
            hideSectionIdentity
            initialData={{
              id: onlySection.id,
              slug: onlySection.slug,
              name: onlySection.name,
              areaType: onlySection.areaType as AreaType | undefined,
              grassType: onlySection.grassType as YardSectionInput["grassType"],
              yardSizeSqft: onlySection.yardSizeSqft ?? undefined,
              soilPh: onlySection.soilPh ?? undefined,
              nitrogenPpm: onlySection.nitrogenPpm ?? undefined,
              phosphorusPpm: onlySection.phosphorusPpm ?? undefined,
              potassiumPpm: onlySection.potassiumPpm ?? undefined,
              organicMatterPct: onlySection.organicMatterPct ?? undefined,
              soilTestSource: onlySection.soilTestSource ?? undefined,
              soilTestedAt: onlySection.soilTestedAt ? onlySection.soilTestedAt.toISOString().slice(0, 10) : undefined,
              soilMoisture: onlySection.soilMoisture as "dry" | "moderate" | "moist" | undefined,
              notes: onlySection.notes ?? undefined,
              wateringDays: onlySection.wateringDays as ("Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat")[],
              wateringTime: onlySection.wateringTime ?? null,
              wateringMinutesPerSession: onlySection.wateringMinutesPerSession ?? undefined,
              mowingDays: onlySection.mowingDays as ("Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat")[],
              mowingTime: onlySection.mowingTime ?? null,
              mowingHeightInches: onlySection.mowingHeightInches ?? undefined,
            }}
          />
        </>
      )}
    </div>
  );
}
