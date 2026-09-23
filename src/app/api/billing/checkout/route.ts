import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { getStripeClient, isStripeConfigured } from "@/lib/billing/stripe";
import { getPlan } from "@/lib/billing/plans";
import { prisma } from "@/lib/db";

const requestSchema = z.object({
  plan: z.enum(["STARTER", "GROWTH", "SCALE"]),
  interval: z.enum(["MONTHLY", "ANNUAL"]),
});

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured on this deployment yet." }, { status: 501 });
  }

  const { ctx, response } = await requireRole("ADMIN");
  if (!ctx) return response;

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const planDef = getPlan(parsed.data.plan);
  const priceId = parsed.data.interval === "MONTHLY" ? planDef.stripeMonthlyPriceId : planDef.stripeAnnualPriceId;
  if (!priceId) {
    return NextResponse.json(
      { error: `No Stripe price configured for ${planDef.name} (${parsed.data.interval}).` },
      { status: 501 }
    );
  }

  const stripe = getStripeClient();

  let customerId = ctx.tenant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: ctx.user.email,
      name: ctx.tenant.name,
      metadata: { tenantId: ctx.tenant.id },
    });
    customerId = customer.id;
    await prisma.tenant.update({ where: { id: ctx.tenant.id }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${req.nextUrl.origin}/billing?checkout=success`,
    cancel_url: `${req.nextUrl.origin}/billing?checkout=canceled`,
    metadata: { tenantId: ctx.tenant.id },
    subscription_data: { metadata: { tenantId: ctx.tenant.id } },
  });

  return NextResponse.json({ url: session.url });
}
