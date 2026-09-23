import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail } from "./resend";
import { passwordResetTemplate } from "./templates";
import { hashPassword } from "@/lib/auth/password";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function createAndSendPasswordResetEmail(userId: string, email: string, origin: string) {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Invalidate any prior unused reset tokens for this user.
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.create({ data: { userId, token, expiresAt } });

  const resetUrl = `${origin}/reset-password/${token}`;
  const { subject, html } = passwordResetTemplate(resetUrl);
  return sendEmail({ to: email, subject, html });
}

export async function getValidResetToken(token: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;
  return record;
}

export async function consumePasswordReset(token: string, newPassword: string): Promise<boolean> {
  const record = await getValidResetToken(token);
  if (!record) return false;

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    // Reset means "I may have lost control of my account" — revoke every existing session.
    prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  return true;
}
