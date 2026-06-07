import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { SectionCard } from "@/components/yard/SectionCard";

export default async function YardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { sections: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Yards</h1>
        <Link href="/yard/setup">
          <Button className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Add Yard
          </Button>
        </Link>
      </div>

      {yards.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-4">No yards yet. Add your first to get started.</p>
          <Link href="/yard/setup">
            <Button className="bg-green-600 hover:bg-green-700"><Plus className="w-4 h-4 mr-1" /> Add Yard</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {yards.map((yard) => (
            <div key={yard.id}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{yard.name}</h2>
                  <p className="text-sm text-gray-400">ZIP {yard.zipCode}</p>
                </div>
                <Link href={`/yard/${yard.id}/sections/new`}>
                  <Button variant="outline" size="sm">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                  </Button>
                </Link>
              </div>
              {yard.sections.length === 0 ? (
                <p className="text-sm text-gray-400 pl-1">No sections yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {yard.sections.map((section) => (
                    <SectionCard key={section.id} section={section} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
