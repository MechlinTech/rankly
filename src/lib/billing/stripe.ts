import Stripe from "stripe";
import { getIntegrationCredential } from "@/lib/admin/integration-credentials";

let stripeClient: { apiKey: string; instance: Stripe } | null = null;

export async function isStripeConfigured(): Promise<boolean> {
  return !!(await getIntegrationCredential("STRIPE_SECRET_KEY"));
}

/** Lazily constructed so the app can boot without Stripe credentials configured. */
export async function getStripeClient(): Promise<Stripe> {
  const apiKey = await getIntegrationCredential("STRIPE_SECRET_KEY");
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  if (!stripeClient || stripeClient.apiKey !== apiKey) {
    stripeClient = { apiKey, instance: new Stripe(apiKey) };
  }
  return stripeClient.instance;
}

export async function verifyWebhookSignature(rawBody: string, signature: string): Promise<Stripe.Event> {
  const webhookSecret = await getIntegrationCredential("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  }
  const stripe = await getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
