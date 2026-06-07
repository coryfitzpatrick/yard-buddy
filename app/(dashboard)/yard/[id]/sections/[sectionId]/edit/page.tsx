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

  const { id, sectionId } = await params;
  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { id, userId: session.user.id } },
    include: { yard: { select: { name: true, zipCode: true } } },
  });
  if (!section) notFound();

  return (
    <div className="px-4 py-8">
      <Link href="/yard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft className="w-4 h-4" /> {section.yard.name}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit {section.name}</h1>
      <SectionForm
        yardId={id}
        zipCode={section.yard.zipCode}
        initialData={{
          id: section.id,
          name: section.name,
          areaType: section.areaType as import("@/types").AreaType | undefined,
          grassType: section.grassType as import("@/lib/validations/yard").YardSectionInput["grassType"],
          yardSizeSqft: section.yardSizeSqft ?? undefined,
          soilPh: section.soilPh ?? undefined,
          soilMoisture: section.soilMoisture as "dry" | "moderate" | "moist" | undefined,
          spreaderType: section.spreaderType as import("@/lib/validations/yard").YardSectionInput["spreaderType"],
          spreaderModel: section.spreaderModel ?? undefined,
          notes: section.notes ?? undefined,
        }}
      />
    </div>
  );
}
