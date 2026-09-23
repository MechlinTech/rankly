import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail } from "./resend";
import { verifyEmailTemplate } from "./templates";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function createAndSendVerificationEmail(userId: string, email: string, origin: string) {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.emailVerificationToken.create({ data: { userId, token, expiresAt } });

  const verifyUrl = `${origin}/api/auth/verify-email/${token}`;
  const { subject, html } = verifyEmailTemplate(verifyUrl);
  const result = await sendEmail({ to: email, subject, html });

  return { ...result, verifyUrl };
}

export async function consumeVerificationToken(token: string): Promise<{ ok: boolean; userId?: string }> {
  const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false };
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } }),
  ]);

  return { ok: true, userId: record.userId };
}
