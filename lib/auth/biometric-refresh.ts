import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  const hash = hashRefreshToken(token);
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function validateAndConsume(
  plaintextToken: string,
): Promise<{ userId: string; rowId: string } | null> {
  const tokenHash = hashRefreshToken(plaintextToken);
  const row = await db.biometricRefreshToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, revokedAt: true, lastUsedAt: true },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (Date.now() - row.lastUsedAt.getTime() > REFRESH_TTL_MS) return null;
  return { userId: row.userId, rowId: row.id };
}
