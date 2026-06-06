import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { YardEditForm } from "@/components/yard/YardEditForm";

export default async function EditYardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const yard = await db.yardProfile.findFirst({ where: { id, userId: session.user.id } });
  if (!yard) notFound();

  return (
    <div className="px-4 py-8">
      <Link href="/yard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft className="w-4 h-4" /> My Yards
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit {yard.name}</h1>
      <YardEditForm yard={yard} />
    </div>
  );
}
