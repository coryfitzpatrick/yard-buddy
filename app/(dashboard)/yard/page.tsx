import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, Pencil } from "lucide-react";
import { YardDeleteButton } from "@/components/yard/YardDeleteButton";

export default async function YardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      zipCode: true,
      _count: { select: { sections: true } },
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
        <div className="space-y-4">
          {yards.map((yard) => (
            <div key={yard.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{yard.name}</h2>
                  <p className="text-sm text-gray-400">
                    ZIP {yard.zipCode}
                    {yard._count.sections > 0 && (
                      <> &middot; {yard._count.sections} section{yard._count.sections !== 1 ? "s" : ""}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Link href={`/yard/${yard.id}`}>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
