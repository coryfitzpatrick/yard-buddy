import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Footer } from "@/components/Footer";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <DashboardNav signOutAction={handleSignOut} />
      <main className="flex-1 max-w-6xl mx-auto w-full pb-20 sm:pb-0">
        {children}
      </main>
      <Footer />
    </div>
  );
}
