import { Resend } from "resend";

/** EMAIL_FROM is canonical. RESEND_FROM_EMAIL is accepted so existing deployments keep sending. */
export function emailFromAddress(): string | undefined {
  const value = (process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL)?.trim();
  return value || undefined;
}

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && emailFromAddress());
}

let client: Resend | null = null;

function getClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set.");
  }
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
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
  if (!isEmailConfigured()) {
    return { sent: false, reason: "No email provider configured (RESEND_API_KEY / EMAIL_FROM unset)." };
  }

  const from = emailFromAddress();
  if (!from) {
    return { sent: false, reason: "No email provider configured (RESEND_API_KEY / EMAIL_FROM unset)." };
  }

  const resend = getClient();
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  return { sent: true };
}
