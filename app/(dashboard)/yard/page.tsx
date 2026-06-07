import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, Pencil } from "lucide-react";
import { SectionCard } from "@/components/yard/SectionCard";
import { YardDeleteButton } from "@/components/yard/YardDeleteButton";
import { YardTasksSection } from "@/components/yard/YardTasksSection";

export default async function YardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      sections: {
        orderBy: { createdAt: "asc" },
        include: {
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
              yardSectionId: true,
            },
          },
        },
      },
    },
  });

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Yards</h1>
        <Link href="/yard/setup">
          <Button className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4" />Add Yard
          </Button>
        </Link>
      </div>

      {yards.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-4">No yards yet. Add your first to get started.</p>
          <Link href="/yard/setup">
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4" />Add Yard
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {yards.map((yard: (typeof yards)[number]) => (
            <div key={yard.id}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{yard.name}</h2>
                  <p className="text-sm text-gray-400">ZIP {yard.zipCode}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Link href={`/yard/${yard.id}`}>
                    <Button variant="outline" size="sm">
                      <ArrowRight className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                  </Link>
                  <Link href={`/yard/${yard.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                  </Link>
                  <Link href={`/yard/${yard.id}/sections/new`}>
                    <Button variant="outline" size="sm">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                    </Button>
                  </Link>
                  <YardDeleteButton yardId={yard.id} yardName={yard.name} />
                </div>
              </div>
              {yard.sections.length === 0 ? (
                <p className="text-sm text-gray-400 pl-1">No sections yet.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {yard.sections.map((section: (typeof yard)["sections"][number]) => (
                      <SectionCard key={section.id} section={section} />
                    ))}
                  </div>
                  <YardTasksSection
                    sections={yard.sections.map((s: (typeof yard)["sections"][number]) => ({
                      id: s.id,
                      name: s.name,
                    }))}
                    tasks={yard.sections.flatMap((s: (typeof yard)["sections"][number]) =>
                      s.tasks.map((t) => ({
                        ...t,
                        scheduledStart: t.scheduledStart?.toISOString() ?? null,
                        scheduledEnd: t.scheduledEnd?.toISOString() ?? null,
                        yardSection: {
                          id: s.id,
                          name: s.name,
                          areaType: s.areaType,
                          yard: { name: yard.name },
                        },
                      }))
                    )}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
