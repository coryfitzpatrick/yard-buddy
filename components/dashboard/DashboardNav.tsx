"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { LayoutDashboard, Search, LogOut, Fence, Menu, Settings, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  signOutAction: () => Promise<void>;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analyze", label: "Analyze", icon: Search },
  { href: "/yard", label: "Yards", icon: Fence },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function DashboardNav({ signOutAction }: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/dashboard" className="flex items-center gap-1 font-bold text-green-700 text-lg">
            <Logo className="h-8 w-auto" />
            Yard Analyzer
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link key={href} href={href}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "text-base",
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

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* Mobile sheet menu */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-72 p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
            <SheetTitle className="flex items-center gap-2 text-green-700">
              <Logo className="h-7 w-auto" />
              Yard Analyzer
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col p-3 gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <SheetClose key={href} render={<Link href={href} />}>
                  <span
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors",
                      active
                        ? "bg-green-50 text-green-700"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" /> {label}
                  </span>
                </SheetClose>
              );
            })}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100">
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" className="w-full justify-start text-gray-600 hover:text-red-600 hover:bg-red-50">
                <LogOut className="w-4 h-4 mr-3" /> Sign out
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bottom mobile nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2 z-10">
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
