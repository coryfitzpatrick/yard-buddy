import crypto from "crypto";

// One-way SHA-256 of a raw token. We email the raw token to the user, but
// store only the hash in the DB so a read-only DB leak (or a stray service
// role with RLS bypassed) can't be replayed against the reset/confirm flow.
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
