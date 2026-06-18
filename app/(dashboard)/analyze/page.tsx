import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AnalyzeClient, type AnalyzeYard } from "./AnalyzeClient";

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const raw = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
          analyses: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { healthScore: true },
          },
        },
      },
    },
  });

  // Shape rows for the client island - Date fields become ISO strings, the
  // free-form soilMoisture string is narrowed to its three valid values.
  const yards: AnalyzeYard[] = raw.map((y) => ({
    id: y.id,
    name: y.name,
    zipCode: y.zipCode,
    sections: y.sections.map((s) => ({
      id: s.id,
      name: s.name,
      areaType: s.areaType,
      grassType: s.grassType,
      soilPh: s.soilPh,
      soilMoisture: s.soilMoisture as "dry" | "moderate" | "moist" | null,
      notes: s.notes,
      nitrogenPpm: s.nitrogenPpm,
      phosphorusPpm: s.phosphorusPpm,
      potassiumPpm: s.potassiumPpm,
      organicMatterPct: s.organicMatterPct,
      soilTestSource: s.soilTestSource,
      soilTestedAt: s.soilTestedAt?.toISOString() ?? null,
      analyses: s.analyses,
    })),
  }));

  const { sectionId } = await searchParams;

  // Pre-select on the server so the client renders the right yard/section on
  // first paint - no loading spinner, no useEffect dance.
  let initialYardId = "";
  let initialSectionId = "";
  if (sectionId) {
    const yard = yards.find((y) => y.sections.some((s) => s.id === sectionId));
    if (yard) {
      initialYardId = yard.id;
      initialSectionId = sectionId;
    }
  } else if (yards.length === 1) {
    initialYardId = yards[0].id;
    if (yards[0].sections.length === 1) {
      initialSectionId = yards[0].sections[0].id;
    }
  }

  return (
    <AnalyzeClient
      yards={yards}
      initialYardId={initialYardId}
      initialSectionId={initialSectionId}
    />
  );
}
