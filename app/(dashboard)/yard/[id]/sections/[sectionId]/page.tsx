import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Camera, Pencil, Images } from "lucide-react";
import { AREA_CONFIG } from "@/components/yard/AreaTypeSelector";
import type { AreaType } from "@/types";
import { SectionHealthChart } from "@/components/yard/SectionHealthChart";
import { TaskList } from "@/components/dashboard/TaskList";
import { ScheduleRecommendationCard } from "@/components/sections/ScheduleRecommendationCard";
import { effectiveWatering, effectiveMowing } from "@/lib/schedules/effective-schedule";
import { format } from "date-fns";
import { getPlanLimits, getDaysUntilDeletion, canRunAnalysis } from "@/lib/subscription";
import NotInApp from "@/components/NotInApp";

export default async function SectionDetailPage({
  params,
}: {
  params: Promise<{ id: string; sectionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id: yardSlug, sectionId: sectionSlug } = await params;

  const yardRecord = await db.yard.findFirst({
    where: { slug: yardSlug, userId: session.user.id },
    select: { id: true },
  });
  if (!yardRecord) notFound();
  const yardId = yardRecord.id;

  const subscriptionUser = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { plan: true, planStatus: true, trialEndsAt: true, currentPeriodEnd: true, pausedUntil: true },
  });
  const limits = getPlanLimits(subscriptionUser);
  const daysUntilDeletion = getDaysUntilDeletion(subscriptionUser);

  const sectionRecord = await db.yardSection.findFirst({
    where: { yardId, slug: sectionSlug },
    select: { id: true },
  });
  if (!sectionRecord) notFound();
  const sectionId = sectionRecord.id;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyAnalysisCount = await db.lawnAnalysis.count({
    where: {
      yardSection: { yardId },
      createdAt: { gte: startOfMonth },
    },
  });

  const analysisLimitReached = !canRunAnalysis(subscriptionUser, monthlyAnalysisCount);
  const analysisLimitText =
    limits.maxAnalysesPerYardPerMonth === -1
      ? null
      : `${monthlyAnalysisCount} of ${limits.maxAnalysesPerYardPerMonth} analyses used for this yard this month`;

  const section = await db.yardSection.findFirst({
    where: { id: sectionId, yardId },
    include: {
      yard: {
        select: {
          id: true,
          name: true,
          wateringDays: true,
          wateringTime: true,
          wateringMinutesPerSession: true,
          mowingDays: true,
          mowingTime: true,
          mowingHeightInches: true,
        },
      },
      analyses: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          healthScore: true,
          issues: true,
          summary: true,
          createdAt: true,
          imageUrls: true,
          wateringSchedule: true,
          wateringDeviates: true,
          wateringSuggestedDaysPerWeek: true,
          wateringSuggestedMinutesPerSession: true,
          wateringRecommendationDismissedAt: true,
          mowingSchedule: true,
          mowingDeviates: true,
          mowingSuggestedDaysPerWeek: true,
          mowingSuggestedHeightInches: true,
          mowingRecommendationDismissedAt: true,
        },
      },
      tasks: {
        where: {
          status: { not: "skipped" },
        },
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
          yardSectionId: true,
        },
      },
    },
  });
  if (!section) notFound();

  // Also fetch tasks from other sections that were merged to show on this section's page
  const sharedTasks = await db.lawnTask.findMany({
    where: {
      additionalSectionIds: { has: sectionId },
      status: { not: "skipped" },
    },
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
      yardSectionId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const areaCfg = section.areaType ? AREA_CONFIG[section.areaType as AreaType] : null;
  const AreaIcon = areaCfg?.icon;
  const latestAnalysis = section.analyses[0] ?? null;

  const totalPhotoCount = section.analyses.reduce((sum, a) => sum + a.imageUrls.length, 0);

  const chartData = [...section.analyses].reverse().map((a) => ({
    date: a.createdAt.toISOString(),
    score: a.healthScore,
  }));

  const scoreColor =
    latestAnalysis == null ? "text-gray-300" :
    latestAnalysis.healthScore >= 70 ? "text-green-600" :
    latestAnalysis.healthScore >= 40 ? "text-yellow-600" : "text-red-600";

  const sectionRef = { id: section.id, name: section.name, areaType: section.areaType, yard: { name: section.yard.name } };
  type RawTask = { id: string; title: string; description: string; priority: string; status: string; scheduledStart: Date | null; scheduledEnd: Date | null; overdueNote: string | null; stillWorthDoing: boolean | null; product: string | null; applicationRate: string | null; spreaderSetting: string | null; taskMode: string | null; productSearchQuery: string | null; yardSectionId: string };
  const serializeTask = (t: RawTask) => ({
    ...t,
    scheduledStart: t.scheduledStart?.toISOString() ?? null,
    scheduledEnd: t.scheduledEnd?.toISOString() ?? null,
    yardSection: sectionRef,
  });

  const serializedTasks = [
    ...section.tasks.map(serializeTask),
    ...sharedTasks.map(serializeTask),
  ];

  const visibleTasks = limits.maxVisibleTasks === -1 ? serializedTasks : serializedTasks.slice(0, limits.maxVisibleTasks);
  const hiddenTaskCount = limits.maxVisibleTasks === -1 ? 0 : Math.max(0, serializedTasks.length - limits.maxVisibleTasks);

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <Link
        href={`/yard/${yardSlug}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> {section.yard.name}
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

      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2">
            {AreaIcon && <AreaIcon className="w-5 h-5 text-gray-400" />}
            <h1 className="text-2xl font-bold text-gray-900">{section.name}</h1>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {section.grassType.replace(/_/g, " ")}
            {section.yardSizeSqft ? ` · ${section.yardSizeSqft.toLocaleString()} sq ft` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/yard/${yardSlug}/sections/${sectionSlug}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
          </Link>
          <Link href={`/analyze?sectionId=${sectionId}`}>
            <Button size="sm" className="bg-green-600 hover:bg-green-700">
              <Camera className="w-3.5 h-3.5 mr-1" /> Analyze
            </Button>
          </Link>
        </div>
      </div>
      {analysisLimitReached ? (
        <NotInApp>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-3 mb-4">
            <span>
              You have used all your analyses for this month.{" "}
              <strong>Limit resets on the 1st of next month.</strong>
            </span>
            <a
              href="/pricing"
              className="shrink-0 text-green-700 font-semibold underline hover:text-green-900 whitespace-nowrap"
            >
              Upgrade for more
            </a>
          </div>
        </NotInApp>
      ) : analysisLimitText ? (
        <p className="text-xs text-gray-400 mt-1 mb-4">{analysisLimitText}</p>
      ) : null}

      {/* Health score + chart */}
      {latestAnalysis ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold ${scoreColor}`}>
              {latestAnalysis.healthScore}
            </span>
            <span className="text-sm text-gray-400">/ 100 health score</span>
            <span className="text-xs text-gray-400 ml-auto">
              {format(new Date(latestAnalysis.createdAt), "MMM d, yyyy")}
            </span>
          </div>
          {chartData.length >= 2 && <SectionHealthChart data={chartData} />}
          {latestAnalysis.summary && (
            <p className="text-sm text-gray-700">{latestAnalysis.summary}</p>
          )}
          {latestAnalysis.issues.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {latestAnalysis.issues.map((issue) => (
                <span
                  key={issue}
                  className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5"
                >
                  {issue}
                </span>
              ))}
            </div>
          )}
          {latestAnalysis.imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {latestAnalysis.imageUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <Image
                    src={url}
                    alt={`Analysis image ${i + 1}`}
                    width={80}
                    height={80}
                    className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                  />
                </a>
              ))}
            </div>
          )}
          {totalPhotoCount > 0 && (
            <div className="pt-1">
              <Link
                href={`/yard/${yardSlug}/sections/${sectionSlug}/photos`}
                className="inline-flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800 font-medium"
              >
                <Images className="w-4 h-4" />
                View photo history ({totalPhotoCount})
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6 text-center text-sm text-gray-400">
          No analyses yet. Tap Analyze to get started.
        </div>
      )}

      {/* Past analyses */}
      {section.analyses.length > 1 && (
        <details className="bg-white border border-gray-200 rounded-xl mb-8">
          <summary className="px-5 py-4 text-sm text-gray-500 cursor-pointer font-medium select-none list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span className="details-arrow">▶</span>
            {section.analyses.length - 1} past analysis{section.analyses.length - 1 > 1 ? "es" : ""}
          </summary>
          <div className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-3">
            {section.analyses.slice(1).map((a) => {
              const color =
                a.healthScore >= 70 ? "text-green-600" :
                a.healthScore >= 40 ? "text-yellow-600" : "text-red-600";
              return (
                <div key={a.id} className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xl font-bold ${color}`}>{a.healthScore}</span>
                    <span className="text-xs text-gray-400">/ 100</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {format(new Date(a.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{a.summary}</p>
                  {a.issues.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {a.issues.map((issue) => (
                        <span
                          key={issue}
                          className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5"
                        >
                          {issue}
                        </span>
                      ))}
                    </div>
                  )}
                  {a.imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.imageUrls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <Image
                            src={url}
                            alt={`Analysis image ${i + 1}`}
                            width={56}
                            height={56}
                            className="w-14 h-14 object-cover rounded-md border border-gray-200 hover:opacity-80 transition-opacity"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Schedule recommendation cards */}
      <div className="space-y-4 mb-6">
        {(() => {
          const wEff = effectiveWatering(section, section.yard, subscriptionUser.plan);
          const mEff = effectiveMowing(section, section.yard, subscriptionUser.plan);
          return (
            <>
              <ScheduleRecommendationCard
                kind="watering"
                sectionId={section.id}
                yardSlug={yardSlug}
                latestAnalysis={latestAnalysis}
                effective={{ days: wEff.days, time: wEff.time, minutesPerSession: wEff.minutesPerSession, heightInches: null }}
                plan={subscriptionUser.plan}
              />
              <ScheduleRecommendationCard
                kind="mowing"
                sectionId={section.id}
                yardSlug={yardSlug}
                latestAnalysis={latestAnalysis}
                effective={{ days: mEff.days, time: mEff.time, minutesPerSession: null, heightInches: mEff.heightInches }}
                plan={subscriptionUser.plan}
              />
            </>
          );
        })()}
      </div>

      {/* Tasks */}
      {(visibleTasks.length > 0 || hiddenTaskCount > 0) && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Tasks
          </h2>
          <TaskList tasks={visibleTasks} multiYard={false} hiddenTaskCount={hiddenTaskCount} />
        </div>
      )}
    </div>
  );
}
