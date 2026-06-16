import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SplitYardForm } from "@/components/yard/SplitYardForm";

export default async function SplitYardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const yard = await db.yard.findFirst({
    where: { slug: id, userId: session.user.id },
    include: {
      sections: { select: { id: true, name: true, grassType: true, analyses: { select: { id: true } } } },
    },
  });
  if (!yard) notFound();
  if (yard.sections.length !== 1) {
    // Only meaningful when there's a single "whole yard" section to split.
    redirect(`/yard/${id}`);
  }

  const onlySection = yard.sections[0];
  const analysisCount = onlySection.analyses.length;

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <Link href={`/yard/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft className="w-4 h-4" /> {yard.name}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Split {yard.name} into sections</h1>
      <p className="text-sm text-gray-500 mb-6">
        Pick the parts of your yard you want to track separately. Each new section starts fresh, and
        you&apos;ll analyze them individually for grass-type-aware care.
      </p>
      {analysisCount > 0 && (
        <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          <strong>{analysisCount} analysis{analysisCount === 1 ? "" : "es"}</strong> on your current
          &ldquo;{onlySection.name}&rdquo; will be removed when you split. New per-section analyses replace
          the whole-yard view.
        </div>
      )}
      <SplitYardForm yardId={yard.id} yardSlug={id} currentGrassType={onlySection.grassType} />
    </div>
  );
}
