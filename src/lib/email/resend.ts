import { Resend } from "resend";
import { getIntegrationCredential } from "@/lib/admin/integration-credentials";

/** EMAIL_FROM is canonical. RESEND_FROM_EMAIL is accepted so existing deployments keep sending. */
export async function emailFromAddress(): Promise<string | undefined> {
  const value = (await getIntegrationCredential("EMAIL_FROM")) || (await getIntegrationCredential("RESEND_FROM_EMAIL"));
  return value || undefined;
}

export async function isEmailConfigured(): Promise<boolean> {
  const [apiKey, from] = await Promise.all([
    getIntegrationCredential("RESEND_API_KEY"),
    emailFromAddress(),
  ]);
  return !!(apiKey && from);
}

let client: { apiKey: string; instance: Resend } | null = null;

function getClient(apiKey: string): Resend {
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }
  if (!client || client.apiKey !== apiKey) {
    client = { apiKey, instance: new Resend(apiKey) };
  }
  return client.instance;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  /** Present when sending was skipped because no provider is configured. */
  reason?: string;
}

/**
 * Sends an email via Resend if configured; otherwise returns { sent: false }
 * rather than throwing, so callers can fall back to displaying the content
 * directly (e.g. showing an invite link in the UI) instead of crashing.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const [apiKey, from] = await Promise.all([
    getIntegrationCredential("RESEND_API_KEY"),
    emailFromAddress(),
  ]);
  if (!apiKey || !from) {
    return { sent: false, reason: "No email provider configured (RESEND_API_KEY / EMAIL_FROM unset)." };
  }
  const resend = getClient(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  return { sent: true };
}
