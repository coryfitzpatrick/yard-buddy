import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Pencil } from "lucide-react";
import { YardDetailInteractive } from "@/components/yard/YardDetailInteractive";
import { YardAnalysisTimeline } from "@/components/yard/YardAnalysisTimeline";
import { getPlanLimits, getDaysUntilDeletion } from "@/lib/subscription";
import NotInApp from "@/components/NotInApp";

export default async function YardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      weatherWidgetCollapsed: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
    },
  });

  const yard = await db.yard.findFirst({
    where: { slug: id, userId: session.user.id },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          analyses: {
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              healthScore: true,
              summary: true,
              issues: true,
              imageUrls: true,
              createdAt: true,
            },
          },
          tasks: {
            where: { status: { not: "skipped" } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              description: true,
              priority: true,
              status: true,
              scheduledStart: true,
              scheduledEnd: true,
              overdueNote: true,
              stillWorthDoing: true,
              product: true,
              applicationRate: true,
              spreaderSetting: true,
              taskMode: true,
              productSearchQuery: true,
              additionalSectionIds: true,
            },
          },
        },
      },
    },
  });
  if (!yard) notFound();

  const limits = getPlanLimits(user);
  const daysUntilDeletion = getDaysUntilDeletion(user);

  const sectionNameMap = new Map(yard.sections.map((s) => [s.id, s.name]));

  const sectionSummaries = yard.sections.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    areaType: s.areaType,
    grassType: s.grassType,
    yardSizeSqft: s.yardSizeSqft,
    latestHealthScore: s.analyses[0]?.healthScore ?? null,
    pendingTaskCount: s.tasks.filter((t) => t.status === "pending").length,
  }));

  const allTasks = yard.sections.flatMap((s) =>
    s.tasks.map((t) => {
      const additionalNames = t.additionalSectionIds
        .map((aid) => sectionNameMap.get(aid))
        .filter((n): n is string => !!n);
      return {
        ...t,
        scheduledStart: t.scheduledStart?.toISOString() ?? null,
        scheduledEnd: t.scheduledEnd?.toISOString() ?? null,
        yardSection: { id: s.id, name: s.name, areaType: s.areaType, yard: { name: yard.name } },
        mergedSections: additionalNames.length > 0 ? [s.name, ...additionalNames] : undefined,
      };
    })
  );

  const visibleTasks = limits.maxVisibleTasks === -1 ? allTasks : allTasks.slice(0, limits.maxVisibleTasks);
  const hiddenTaskCount = limits.maxVisibleTasks === -1 ? 0 : Math.max(0, allTasks.length - limits.maxVisibleTasks);

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <Link
        href="/yard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> My Yards
      </Link>

      {daysUntilDeletion !== null && (
        <NotInApp>
          <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            daysUntilDeletion <= 7
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-amber-50 border border-amber-200 text-amber-700"
          }`}>
            {daysUntilDeletion > 0
              ? <><strong>Your free trial has ended.</strong> Your data will be deleted in {daysUntilDeletion} day{daysUntilDeletion !== 1 ? "s" : ""} unless you <a href="/pricing" className="underline font-semibold">upgrade your plan</a>.</>
              : <>Your free trial has ended and your data is scheduled for deletion. <a href="/pricing" className="underline font-semibold">Upgrade now</a> to keep your data.</>
            }
          </div>
        </NotInApp>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{yard.name}</h1>
          <p className="text-sm text-gray-400">ZIP {yard.zipCode}</p>
        </div>
        <Link href={`/yard/${id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
        </Link>
      </div>

      {yard.sections.length === 1 && (
        <YardAnalysisTimeline
          analyses={yard.sections[0]!.analyses}
          photoHistoryHref={`/yard/${id}/sections/${yard.sections[0]!.slug}/photos`}
          totalPhotoCount={yard.sections[0]!.analyses.reduce((sum, a) => sum + a.imageUrls.length, 0)}
        />
      )}

      <YardDetailInteractive
        yardId={id}
        zip={yard.zipCode}
        initialWeatherCollapsed={user?.weatherWidgetCollapsed ?? false}
        sections={sectionSummaries}
        tasks={visibleTasks}
        hiddenTaskCount={hiddenTaskCount}
      />
    </div>
  );
}
