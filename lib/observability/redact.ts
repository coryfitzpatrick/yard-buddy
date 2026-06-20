// lib/observability/redact.ts
import { createHash } from "node:crypto";

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export function hashEmail(email: string): string {
  return shortHash(email.toLowerCase());
}

// IPs need to remain groupable across log lines (for "noisy IP" dashboards), so
// hash them. The sentinel "unknown" comes from getClientIp() when no
// x-forwarded-for is present; pass it through so the dashboard shows it
// distinctly rather than as a meaningless hash.
export function hashIp(ip: string): string {
  if (ip === "unknown") return "unknown";
  return shortHash(ip);
}
