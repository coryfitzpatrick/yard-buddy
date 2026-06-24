"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Tag, LogIn, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/pricing", label: "Pricing", icon: Tag },
  { href: "/login", label: "Sign in", icon: LogIn },
  { href: "/register", label: "Sign up", icon: UserPlus },
];

export function PublicBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2 z-10"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 text-xs px-3 py-1",
              active ? "text-green-700" : "text-gray-500"
            )}
          >
            <Icon className={cn("w-5 h-5", active && "stroke-[2.5]")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
