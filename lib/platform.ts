import { headers } from "next/headers";

export const TOKEN = "YardAnalyzerApp/";

export async function isMobileApp(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes(TOKEN);
}

export function isMobileAppClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(TOKEN);
}
