import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { DashboardInteractiveSection } from "@/components/dashboard/DashboardInteractiveSection";
import { Greeting } from "@/components/dashboard/Greeting";
import NotInApp from "@/components/NotInApp";
import { computeEngagementStatus, userHasAnySchedule, userHasAnyCompletedTask, getPlanLimits, getDaysUntilDeletion } from "@/lib/subscription";
import { TrialProgressCard } from "@/components/dashboard/TrialProgressCard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      weatherWidgetCollapsed: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      pausedUntil: true,
      trialEngagementBonusGrantedAt: true,
    },
  });

  const isTrial = user?.planStatus === "trialing" || user?.plan === "trial";

  // Kick off engagement queries in parallel with the yard + task fetches below.
  // Paid users skip the queries entirely.
  const engagementSignalsPromise = isTrial && user
    ? Promise.all([
        userHasAnySchedule(session.user.id),
        userHasAnyCompletedTask(session.user.id),
      ])
    : null;

  const yards = await db.yard.findMany({
    where: { userId: session.user.id, archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          // Latest healthScore per section drives the dashboard summary
          // pills. Tasks are fetched separately below to control the
          // selected columns precisely.
          analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { healthScore: true } },
        },
      },
    },
  });

  if (yards.length === 0) redirect("/yard/setup");

  const sectionIds = yards.flatMap((y: (typeof yards)[number]) => y.sections.map((s: (typeof yards)[number]["sections"][number]) => s.id));

  const rawTasks = await db.lawnTask.findMany({
    where: { yardSectionId: { in: sectionIds } },
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
      yardSection: {
        select: { id: true, name: true, areaType: true, yard: { select: { name: true } } },
      },
    },
  });

  const allTasks = rawTasks.map((t) => ({
    ...t,
    scheduledStart: t.scheduledStart?.toISOString() ?? null,
    scheduledEnd: t.scheduledEnd?.toISOString() ?? null,
  }));

  const limits = user ? getPlanLimits(user) : { maxVisibleTasks: -1 as const };
  const daysUntilDeletion = user ? getDaysUntilDeletion(user) : null;
  const tasks = limits.maxVisibleTasks === -1 ? allTasks : allTasks.slice(0, limits.maxVisibleTasks);
  const hiddenTaskCount = limits.maxVisibleTasks === -1 ? 0 : Math.max(0, allTasks.length - limits.maxVisibleTasks);
  const startIndex = limits.maxVisibleTasks === -1 ? 0 : limits.maxVisibleTasks;
  const hiddenTaskTitles = allTasks.slice(startIndex, startIndex + 3).map((t) => t.title);

  const yardSummaries = yards.map((yard: (typeof yards)[number]) => ({
    id: yard.id,
    slug: yard.slug,
    name: yard.name,
    zipCode: yard.zipCode,
    sections: yard.sections.map((s: (typeof yards)[number]["sections"][number]) => ({
      id: s.id,
      name: s.name,
      areaType: s.areaType,
      latestHealthScore: s.analyses[0]?.healthScore ?? null,
    })),
  }));

  // The most recent refresh across all yards. Sending the per-yard array would
  // be more accurate, but the consuming widget only shows one timestamp - and
  // the freshest one is what the user actually wants to see.
  const weatherRefreshedAt = yards
    .map((y: (typeof yards)[number]) => y.weatherRefreshedAt)
    .filter((d): d is Date => d != null)
    .reduce<Date | null>((latest, d) => (latest && latest >= d ? latest : d), null)
    ?.toISOString() ?? null;

  const allSections = yards.flatMap((y: (typeof yards)[number]) =>
    y.sections.map((s: (typeof yards)[number]["sections"][number]) => ({
      id: s.id,
      name: s.name,
      yardId: y.id,
      yardName: y.name,
      showYardLabel: yards.length > 1,
    }))
  );

  let engagement = null as null | {
    scheduleSet: boolean;
    taskCompleted: boolean;
    bonusAlreadyGranted: boolean;
    bonusGrantedAt: Date | null;
    trialEndsAt: Date | null;
  };
  if (engagementSignalsPromise && user) {
    const [anyScheduleSet, anyTaskCompleted] = await engagementSignalsPromise;
    const status = computeEngagementStatus(user, { anyScheduleSet, anyTaskCompleted });
    engagement = {
      scheduleSet: status.scheduleSet,
      taskCompleted: status.taskCompleted,
      bonusAlreadyGranted: status.bonusAlreadyGranted,
      bonusGrantedAt: user.trialEngagementBonusGrantedAt,
      trialEndsAt: user.trialEndsAt,
    };
  }

  return (
    <div className="px-4 py-6 pb-20 sm:pb-6 space-y-6">
      <Greeting name={session.user.name?.split(" ")[0] ?? "there"} />

      {engagement && (
        <TrialProgressCard
          scheduleSet={engagement.scheduleSet}
          taskCompleted={engagement.taskCompleted}
          bonusAlreadyGranted={engagement.bonusAlreadyGranted}
          bonusGrantedAt={engagement.bonusGrantedAt}
          trialEndsAt={engagement.trialEndsAt}
        />
      )}

      {daysUntilDeletion !== null && (
        <NotInApp>
          <div className={`rounded-lg px-4 py-3 text-sm ${
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

      <DashboardInteractiveSection
        yards={yardSummaries}
        tasks={tasks}
        allSections={allSections}
        weatherRefreshedAt={weatherRefreshedAt}
        initialWeatherCollapsed={user?.weatherWidgetCollapsed ?? false}
        hiddenTaskCount={hiddenTaskCount}
        hiddenTaskTitles={hiddenTaskTitles}
      />
    </div>
  );
}
