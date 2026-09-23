import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { getStripeClient, isStripeConfigured } from "@/lib/billing/stripe";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured on this deployment yet." }, { status: 501 });
  }

  const { ctx, response } = await requireRole("ADMIN");
  if (!ctx) return response;

  if (!ctx.tenant.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account exists for this workspace yet." }, { status: 400 });
  }

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: ctx.tenant.stripeCustomerId,
    return_url: `${req.nextUrl.origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
