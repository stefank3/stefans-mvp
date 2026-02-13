// lib/billing/chargeCredits.ts
import { prisma } from "@/lib/prisma";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Transactionally decrement wallet + write ledger entry.
 * Returns updated remaining balance.
 */
export async function chargeCredits(params: {
  auth0Sub: string;
  credits: number;
  requestId: string;
}) {
  const { auth0Sub, credits, requestId } = params;

  if (!Number.isFinite(credits) || credits <= 0) return null;

  return prisma.$transaction(async (tx) => {
    const member = await tx.orgMember.findFirst({
      where: { auth0Sub },
      select: { organizationId: true },
    });
    if (!member) throw new Error("User has no organization");

    const wallet = await tx.creditWallet.findUnique({
      where: {
        organizationId_currency: { organizationId: member.organizationId, currency: "credits" },
      },
      select: { id: true, balance: true },
    });
    if (!wallet) throw new Error("No wallet");

    if (wallet.balance < credits) throw new InsufficientCreditsError();

    const updated = await tx.creditWallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: credits } },
      select: { balance: true },
    });

    await tx.creditLedger.create({
      data: {
        walletId: wallet.id,
        auth0Sub,
        delta: -credits,
        reason: "chat_usage",
        requestId,
      },
    });

    return updated.balance;
  });
}
