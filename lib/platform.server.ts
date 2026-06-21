import { headers } from "next/headers";
import { TOKEN } from "@/lib/platform";

export async function isMobileApp(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes(TOKEN);
}
