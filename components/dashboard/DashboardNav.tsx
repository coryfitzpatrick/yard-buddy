"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Search, LogOut, Fence } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  signOutAction: () => Promise<void>;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analyze", label: "Analyze", icon: Search },
  { href: "/yard", label: "Yards", icon: Fence },
] as const;

export function DashboardNav({ signOutAction }: Props) {
  const pathname = usePathname();

  return (
    <>
      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/dashboard" className="flex items-center gap-1 font-bold text-green-700 text-lg">
            <Image src="/gnome-buddy.png" alt="Yard Buddy" width={32} height={32} className="rounded-full scale-x-[-1]" />
            Yard Buddy
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link key={href} href={href}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      active && "bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-700"
                    )}
                  >
                    <Icon className="w-4 h-4 mr-1" /> {label}
                  </Button>
                </Link>
              );
            })}
            <form action={signOutAction}>
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="w-4 h-4 mr-1" /> Sign out
              </Button>
            </form>
          </div>
        </div>
      </nav>

      {/* Bottom mobile nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 text-xs px-4 py-1",
                active ? "text-green-700" : "text-gray-500"
              )}
            >
              <Icon className={cn("w-5 h-5", active && "stroke-[2.5]")} /> {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
