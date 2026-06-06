import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Search, Leaf, LogOut, Plus, Fence } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-green-700 text-lg">
            <Leaf className="w-5 h-5" /> Yard Buddy
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm"><LayoutDashboard className="w-4 h-4 mr-1" /> Dashboard</Button>
            </Link>
            <Link href="/analyze">
              <Button variant="ghost" size="sm"><Search className="w-4 h-4 mr-1" /> Analyze</Button>
            </Link>
            <Link href="/yard">
              <Button variant="ghost" size="sm"><Fence className="w-4 h-4 mr-1" /> Yards</Button>
            </Link>
            <Link href="/yard/setup">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 ml-1">
                <Plus className="w-4 h-4 mr-1" /> Yard
              </Button>
            </Link>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="w-4 h-4 mr-1" /> Sign out
              </Button>
            </form>
          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto">
        {children}
      </main>
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2">
        <Link href="/dashboard" className="flex flex-col items-center gap-0.5 text-xs text-gray-500 px-4 py-1">
          <LayoutDashboard className="w-5 h-5" /> Home
        </Link>
        <Link href="/analyze" className="flex flex-col items-center gap-0.5 text-xs text-gray-500 px-4 py-1">
          <Search className="w-5 h-5" /> Analyze
        </Link>
        <Link href="/yard" className="flex flex-col items-center gap-0.5 text-xs text-gray-500 px-4 py-1">
          <Fence className="w-5 h-5" /> Yards
        </Link>
        <Link href="/yard/setup" className="flex flex-col items-center gap-0.5 text-xs text-green-600 px-4 py-1">
          <Plus className="w-5 h-5" /> Add
        </Link>
      </nav>
    </div>
  );
}
