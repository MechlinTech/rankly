function baseLayout(bodyHtml: string): string {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0f172a;">
    <p style="font-size: 18px; font-weight: 700; margin: 0 0 24px;">Rankly</p>
    ${bodyHtml}
    <p style="margin-top: 32px; font-size: 12px; color: #94a3b8;">
      If you didn't expect this email, you can safely ignore it.
    </p>
  </div>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;">${label}</a>`;
}

export function verifyEmailTemplate(verifyUrl: string): { subject: string; html: string } {
  return {
    subject: "Verify your email for Rankly",
    html: baseLayout(`
      <p style="font-size: 14px; color: #475569;">Confirm your email address to finish setting up your Rankly account.</p>
      <div style="margin: 20px 0;">${button(verifyUrl, "Verify email")}</div>
      <p style="font-size: 12px; color: #94a3b8;">This link expires in 24 hours.</p>
    `),
  };
}

export function passwordResetTemplate(resetUrl: string): { subject: string; html: string } {
  return {
    subject: "Reset your Rankly password",
    html: baseLayout(`
      <p style="font-size: 14px; color: #475569;">We received a request to reset your Rankly password.</p>
      <div style="margin: 20px 0;">${button(resetUrl, "Reset password")}</div>
      <p style="font-size: 12px; color: #94a3b8;">This link expires in 1 hour. If you didn't request this, your password is still safe — no action is needed.</p>
    `),
  };
}

export function teamInviteTemplate(inviteUrl: string, tenantName: string, inviterEmail: string): { subject: string; html: string } {
  return {
    subject: `${inviterEmail} invited you to join ${tenantName} on Rankly`,
    html: baseLayout(`
      <p style="font-size: 14px; color: #475569;">${inviterEmail} invited you to join <strong>${tenantName}</strong> on Rankly.</p>
      <div style="margin: 20px 0;">${button(inviteUrl, "Accept invitation")}</div>
      <p style="font-size: 12px; color: #94a3b8;">This link expires in 7 days.</p>
    `),
  };
}
