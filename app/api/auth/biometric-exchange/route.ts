import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";
import { db } from "@/lib/db";
import {
  generateRefreshToken,
  validateRefreshToken,
} from "@/lib/auth/biometric-refresh";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { withAxiom, logger } from "@/lib/observability/logger";

const Body = z.object({
  token: z.string().min(1).max(200),
});

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, matches NextAuth default
const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

export const POST = withAxiom(async (req: Request) => {
  // Rate-limit before body parsing so floods cost as little as possible. This
  // is the only unauthenticated endpoint in Group 5 that gates session
  // issuance; 10/min per IP allows legitimate retries (registration listener
  // timeout, transient errors) while making brute-force/DoS impractical.
  const ip = getClientIp(req);
  const { limited } = await checkRateLimit(
    `biometric-exchange:${ip}`,
    10,
    60 * 1000,
    { route: "/api/auth/biometric-exchange", ip, userId: null },
  );
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const validated = await validateRefreshToken(parsed.data.token);
  if (!validated) {
    logger.warn("biometric-exchange: invalid token", {});
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Encode a NextAuth-compatible session JWT. The `salt` parameter must
    // match the cookie name -- NextAuth derives the encryption key from
    // (secret, salt) and uses the cookie name as the salt by default, so
    // tokens produced here decode against the same cookie the framework
    // sets during a normal credentials login.
    const sessionJwt = await encode({
      token: { id: validated.userId, sub: validated.userId },
      secret: process.env.AUTH_SECRET!,
      salt: COOKIE_NAME,
      maxAge: SESSION_MAX_AGE,
    });

    // Rotate the refresh token in a single transaction: revoke the row we
    // just consumed and mint a fresh one. Both succeed together or roll back.
    const { token: newToken, hash: newHash } = generateRefreshToken();
    await db.$transaction(async (tx) => {
      await tx.biometricRefreshToken.update({
        where: { id: validated.rowId },
        data: { revokedAt: new Date() },
      });
      await tx.biometricRefreshToken.create({
        data: { userId: validated.userId, tokenHash: newHash },
      });
    });

    // Set the session cookie with NextAuth's exact attributes so the next
    // request authenticates normally via the framework's auth() helper.
    const res = NextResponse.json({ ok: true, token: newToken });
    res.cookies.set(COOKIE_NAME, sessionJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return res;
  } catch (err) {
    logger.error("biometric-exchange: server error", {
      userId: validated.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
