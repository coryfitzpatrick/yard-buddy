import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PhotoTimeline } from "@/components/sections/PhotoTimeline";

export default async function SectionPhotosPage({
  params,
}: {
  params: Promise<{ id: string; sectionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id: yardId, sectionId } = await params;

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yard: { id: yardId, userId: session.user.id } },
    include: {
      analyses: {
        orderBy: { createdAt: "asc" },
        select: { id: true, imageUrls: true, summary: true, createdAt: true },
      },
    },
  });
  if (!section) notFound();

  // Flatten analyses into individual photo entries — each URL gets its own card
  // with the analysis date and summary as context.
  const photos = section.analyses.flatMap((analysis) =>
    analysis.imageUrls.map((url, i) => ({
      id: `${analysis.id}-${i}`,
      url,
      createdAt: analysis.createdAt,
      analysis: analysis.summary,
    }))
  );

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8 max-w-2xl">
      <Link
        href={`/yard/${yardId}/sections/${sectionId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> {section.name}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Photo history — {section.name}
      </h1>

      <PhotoTimeline photos={photos} sectionName={section.name} />
    </div>
  );
}
