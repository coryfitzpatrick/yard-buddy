"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Home, Tag, LogIn, UserPlus, Mail, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/pricing", label: "Pricing", icon: Tag },
  { href: "/login", label: "Sign in", icon: LogIn },
  { href: "/register", label: "Sign up", icon: UserPlus },
  { href: "/contact", label: "Contact", icon: Mail },
] as const;

export function PublicHamburger() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        className="sm:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-72 p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
            <SheetTitle className="flex items-center gap-2 text-green-700">
              <Logo className="h-6 w-auto" />
              <span className="text-gray-300 font-normal">|</span>
              Yard Analyzer
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col p-3 gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href || (href !== "/" && pathname.startsWith(href));
              return (
                <SheetClose key={href} render={<Link href={href} prefetch={false} />}>
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
        </SheetContent>
      </Sheet>
    </>
  );
}
