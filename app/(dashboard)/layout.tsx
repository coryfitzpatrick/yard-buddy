import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav signOutAction={handleSignOut} />
      <main className="max-w-6xl mx-auto">
        {children}
      </main>
    </div>
  );
}
