export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { auth0 } from "@/lib/auth0";
import { isAdminFromAccessToken } from "@/lib/auth/rbac";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

function headers(requestId: string) {
  return { "X-Request-Id": requestId };
}

type Body = {
  amount: number;              // required, positive integer
  organizationId?: string;     // optional, defaults to admin’s org
  note?: string;               // optional, stored in reason suffix
};

export async function POST(req: Request) {
  const inbound = req.headers.get("x-request-id");
  const requestId = inbound && inbound.length < 200 ? inbound : randomUUID();

  try {
    const session = await auth0.getSession();
    if (!session?.user?.sub) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: headers(requestId) });
    }

    const isAdmin = await isAdminFromAccessToken();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: headers(requestId) });
    }

    const auth0Sub = session.user.sub as string;

    const body = (await req.json()) as Body;
    const amountRaw = body?.amount;

    // Validate amount
    const amount = Number.isFinite(amountRaw) ? Math.trunc(amountRaw) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid amount (must be a positive integer)" },
        { status: 400, headers: headers(requestId) }
      );
    }
    if (amount > 1_000_000) {
      return NextResponse.json(
        { ok: false, error: "Amount too large" },
        { status: 400, headers: headers(requestId) }
      );
    }

    // Resolve organizationId
    let organizationId = body?.organizationId;

    if (!organizationId) {
      const member = await prisma.orgMember.findFirst({
        where: { auth0Sub },
        select: { organizationId: true },
      });
      if (!member) {
        return NextResponse.json(
          { ok: false, error: "Admin has no organization" },
          { status: 400, headers: headers(requestId) }
        );
      }
      organizationId = member.organizationId;
    }

    const reason = body?.note?.trim()
      ? `admin_adjust:${body.note.trim().slice(0, 60)}`
      : "admin_adjust";

    const result = await prisma.$transaction(async (tx) => {
      // Ensure wallet exists
      const wallet =
        (await tx.creditWallet.findUnique({
          where: { organizationId_currency: { organizationId, currency: "credits" } },
          select: { id: true, balance: true },
        })) ??
        (await tx.creditWallet.create({
          data: { organizationId, currency: "credits", balance: 0 },
          select: { id: true, balance: true },
        }));

      const updated = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
        select: { balance: true },
      });

      await tx.creditLedger.create({
        data: {
          walletId: wallet.id,
          auth0Sub,
          delta: amount,
          reason,
          requestId,
        },
      });

      return { walletId: wallet.id, balance: updated.balance };
    });

    return NextResponse.json(
      { ok: true, organizationId, amount, balance: result.balance },
      { status: 200, headers: headers(requestId) }
    );
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    log("error", { requestId, event: "chat_error", error: errMsg });
    return NextResponse.json(
      { ok: false, error: "Server error", details: errMsg },
      { status: 500, headers: headers(requestId) }
    );
  }
}
