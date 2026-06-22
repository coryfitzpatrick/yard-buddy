import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SectionForm } from "@/components/yard/SectionForm";

export default async function NewSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const [yard, subscriptionUser] = await Promise.all([
    db.yard.findFirst({
      where: { slug: id, userId: session.user.id },
      select: {
        id: true,
        name: true,
        zipCode: true,
        streetAddress: true,
        lotSqft: true,
        buildingSqft: true,
        wateringDays: true,
        wateringTime: true,
        wateringMinutesPerSession: true,
        mowingDays: true,
        mowingTime: true,
        mowingHeightInches: true,
      },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    }),
  ]);
  if (!yard) notFound();

  return (
    <div className="px-4 py-8">
      <Link href="/yard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft className="w-4 h-4" /> {yard.name}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add Section to {yard.name}</h1>
      <SectionForm
        yardId={yard.id}
        yardSlug={id}
        zipCode={yard.zipCode}
        lotSqft={yard.lotSqft ?? undefined}
        buildingSqft={yard.buildingSqft ?? undefined}
        plan={subscriptionUser?.plan ?? null}
        latestAnalysis={null}
        yardWateringDays={yard.wateringDays}
        yardWateringTime={yard.wateringTime ?? null}
        yardWateringMinutesPerSession={yard.wateringMinutesPerSession ?? null}
        yardMowingDays={yard.mowingDays}
        yardMowingTime={yard.mowingTime ?? null}
        yardMowingHeightInches={yard.mowingHeightInches ?? null}
      />
    </div>
  );
}
