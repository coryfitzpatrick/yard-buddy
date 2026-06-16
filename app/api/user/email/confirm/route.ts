import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

function redirectToSettings(req: NextRequest, status: "success" | "expired" | "invalid" | "taken" | "error") {
  const url = new URL("/settings", req.url);
  url.searchParams.set("emailChange", status);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return redirectToSettings(req, "invalid");

  const request = await db.emailChangeRequest.findUnique({
    where: { token },
    include: { user: { select: { id: true, stripeCustomerId: true } } },
  });
  if (!request) return redirectToSettings(req, "invalid");

  if (request.expiresAt < new Date()) {
    await db.emailChangeRequest.delete({ where: { id: request.id } }).catch(() => {});
    return redirectToSettings(req, "expired");
  }

  // Double-check the address still isn't claimed (race between request and confirm).
  const conflict = await db.user.findUnique({
    where: { email: request.newEmail },
    select: { id: true },
  });
  if (conflict && conflict.id !== request.userId) {
    await db.emailChangeRequest.delete({ where: { id: request.id } }).catch(() => {});
    return redirectToSettings(req, "taken");
  }

  try {
    await db.$transaction([
      db.user.update({
        where: { id: request.userId },
        data: { email: request.newEmail, emailVerified: new Date() },
      }),
      db.emailChangeRequest.delete({ where: { id: request.id } }),
    ]);
  } catch {
    return redirectToSettings(req, "error");
  }

  // Best-effort Stripe sync — billing should match the new app email.
  if (request.user.stripeCustomerId) {
    try {
      await stripe.customers.update(request.user.stripeCustomerId, { email: request.newEmail });
    } catch {
      // Stripe sync failure shouldn't block the email change; log via Stripe dashboard if needed.
    }
  }

  return redirectToSettings(req, "success");
}
