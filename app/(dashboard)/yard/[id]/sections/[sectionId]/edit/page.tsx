import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SectionForm } from "@/components/yard/SectionForm";

export default async function EditSectionPage({
  params,
}: {
  params: Promise<{ id: string; sectionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id: yardSlug, sectionId: sectionSlug } = await params;
  const [yard, subscriptionUser] = await Promise.all([
    db.yard.findFirst({
      where: { slug: yardSlug, userId: session.user.id },
      select: { id: true },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    }),
  ]);
  if (!yard) notFound();

  const [section, latestAnalysis] = await Promise.all([
    db.yardSection.findFirst({
      where: { slug: sectionSlug, yardId: yard.id },
      include: {
        yard: {
          select: {
            name: true,
            zipCode: true,
            lotSqft: true,
            buildingSqft: true,
            streetAddress: true,
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
    db.lawnAnalysis.findFirst({
      where: { yardSection: { slug: sectionSlug, yardId: yard.id } },
      orderBy: { createdAt: "desc" },
      select: {
        wateringSuggestedDaysPerWeek: true,
        wateringSuggestedMinutesPerSession: true,
        mowingSuggestedDaysPerWeek: true,
        mowingSuggestedHeightInches: true,
      },
    }),
  ]);
  if (!section) notFound();

  return (
    <div className="px-4 py-8">
      <Link href="/yard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft className="w-4 h-4" /> {section.yard.name}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit {section.name}</h1>
      <SectionForm
        yardId={yard.id}
        yardSlug={yardSlug}
        zipCode={section.yard.zipCode}
        lotSqft={section.yard.lotSqft ?? undefined}
        buildingSqft={section.yard.buildingSqft ?? undefined}
        streetAddress={section.yard.streetAddress ?? undefined}
        plan={subscriptionUser?.plan ?? null}
        latestAnalysis={latestAnalysis}
        yardWateringDays={section.yard.wateringDays}
        yardWateringTime={section.yard.wateringTime ?? null}
        yardWateringMinutesPerSession={section.yard.wateringMinutesPerSession ?? null}
        yardMowingDays={section.yard.mowingDays}
        yardMowingTime={section.yard.mowingTime ?? null}
        yardMowingHeightInches={section.yard.mowingHeightInches ?? null}
        initialData={{
          id: section.id,
          slug: section.slug,
          name: section.name,
          areaType: section.areaType as import("@/types").AreaType | undefined,
          grassType: section.grassType as import("@/lib/validations/yard").YardSectionInput["grassType"],
          yardSizeSqft: section.yardSizeSqft ?? undefined,
          soilPh: section.soilPh ?? undefined,
          nitrogenPpm: section.nitrogenPpm ?? undefined,
          phosphorusPpm: section.phosphorusPpm ?? undefined,
          potassiumPpm: section.potassiumPpm ?? undefined,
          organicMatterPct: section.organicMatterPct ?? undefined,
          soilTestSource: section.soilTestSource ?? undefined,
          soilTestedAt: section.soilTestedAt ? section.soilTestedAt.toISOString().slice(0, 10) : undefined,
          soilMoisture: section.soilMoisture as "dry" | "moderate" | "moist" | undefined,
          notes: section.notes ?? undefined,
          wateringDays: (section.wateringDays as ("Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat")[] | undefined) ?? undefined,
          wateringTime: section.wateringTime ?? null,
          wateringMinutesPerSession: section.wateringMinutesPerSession ?? undefined,
          mowingDays: (section.mowingDays as ("Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat")[] | undefined) ?? undefined,
          mowingTime: section.mowingTime ?? null,
          mowingHeightInches: section.mowingHeightInches ?? undefined,
        }}
      />
    </div>
  );
}
