import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { YardCard } from "@/components/yard/YardCard";

export default async function YardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yardProfile.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
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
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-1" /> Add Yard
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {yards.map((yard) => (
            <YardCard key={yard.id} yard={yard} />
          ))}
        </div>
      )}
    </div>
  );
}
