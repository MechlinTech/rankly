import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature, isStripeConfigured, getStripeClient } from "@/lib/billing/stripe";
import { findPlanByStripePriceId } from "@/lib/billing/price-lookup";
import type { TenantStatus } from "@/generated/prisma/client";

function mapSubscriptionStatus(status: Stripe.Subscription.Status): TenantStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "canceled":
    case "unpaid":
      return "CANCELED";
    default:
      // past_due, incomplete, incomplete_expired, paused: treat as suspended pending resolution.
      return "SUSPENDED";
  }
}

async function upsertFromSubscription(subscription: Stripe.Subscription) {
  const tenantId = subscription.metadata?.tenantId;
  if (!tenantId) return;

  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  const mapped = priceId ? findPlanByStripePriceId(priceId) : null;
  const periodEndUnix = item?.current_period_end;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      stripeSubscriptionId: subscription.id,
      plan: mapped?.plan ?? undefined,
      billingInterval: mapped?.interval ?? undefined,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : undefined,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      status: mapSubscriptionStatus(subscription.status),
    },
  });
}

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured on this deployment yet." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  // Idempotency: a webhook can be delivered more than once. Skip if we've already processed this event id.
  const alreadyProcessed = await prisma.billingEvent.findUnique({ where: { stripeEventId: event.id } });
  if (alreadyProcessed) {
    return NextResponse.json({ ok: true, skipped: "duplicate" });
  }

  const tenantIdFromEvent =
    (event.data.object as { metadata?: { tenantId?: string } }).metadata?.tenantId ?? null;

  await prisma.billingEvent.create({
    data: {
      stripeEventId: event.id,
      type: event.type,
      tenantId: tenantIdFromEvent,
      payload: event as unknown as object,
    },
  });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription && typeof session.subscription === "string") {
        const stripe = getStripeClient();
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await upsertFromSubscription(subscription);
      }
      break;
    }
    case "customer.subscription.updated": {
      await upsertFromSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata?.tenantId;
      if (tenantId) {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { plan: "FREE", status: "CANCELED", stripeSubscriptionId: null },
        });
      }
      break;
    }
    case "invoice.payment_failed": {
      // Grace period, not immediate suspension: flag for a dunning email once transactional
      // email exists (see KNOWN_LIMITATIONS.md). Not enforced further yet.
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
