import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { withAxiom } from "@/lib/observability/logger";

export const GET = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Fetch stripeCustomerId from our DB — never accept it from request params
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!user.stripeCustomerId) {
    return NextResponse.redirect(new URL("/pricing", req.url));
  }

  const flow = req.nextUrl.searchParams.get("flow");
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.NEXTAUTH_URL}/settings`,
    ...(flow === "payment_method_update"
      ? {
          flow_data: {
            type: "payment_method_update",
            after_completion: {
              type: "redirect",
              redirect: { return_url: `${process.env.NEXTAUTH_URL}/settings` },
            },
          },
        }
      : {}),
  });

  return NextResponse.redirect(portalSession.url);
});
