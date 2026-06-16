import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const DASHBOARD_PREFIXES = ["/dashboard", "/yard", "/analyze"];
const AUTH_PREFIXES = ["/login", "/register"];

function matchesPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isAuthPage = matchesPrefix(pathname, AUTH_PREFIXES);
  const isDashboard = matchesPrefix(pathname, DASHBOARD_PREFIXES);

  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
