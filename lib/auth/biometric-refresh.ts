import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const REFRESH_TOKEN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  const hash = hashRefreshToken(token);
  return { token, hash };
}

// Exported only so tests can verify the hash format; no runtime caller outside this module uses it directly.
// generateRefreshToken() returns the hash as part of its result, and validateRefreshToken() hashes internally.
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function validateRefreshToken(
  plaintextToken: string,
): Promise<{ userId: string; rowId: string } | null> {
  const tokenHash = hashRefreshToken(plaintextToken);
  const row = await db.biometricRefreshToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, revokedAt: true, createdAt: true },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (Date.now() - row.createdAt.getTime() > REFRESH_TOKEN_MAX_AGE_MS) return null;
  return { userId: row.userId, rowId: row.id };
}
