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

export async function GET(req: Request) {
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

    // Find org for this admin (MVP: single org membership)
    const member = await prisma.orgMember.findFirst({
      where: { auth0Sub },
      select: { organizationId: true, role: true },
    });

    if (!member) {
      return NextResponse.json(
        { ok: true, organization: null, wallet: null, subscription: null, membersCount: 0, ledger: [] },
        { status: 200, headers: headers(requestId) }
      );
    }

    const [org, wallet, subscription, membersCount, ledger] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: member.organizationId },
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.creditWallet.findUnique({
        where: { organizationId_currency: { organizationId: member.organizationId, currency: "credits" } },
        select: { id: true, balance: true, currency: true, updatedAt: true, createdAt: true },
      }),
      prisma.subscription.findFirst({
        where: { organizationId: member.organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          planCode: true,
          seats: true,
          monthlyCredits: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          createdAt: true,
        },
      }),
      prisma.orgMember.count({ where: { organizationId: member.organizationId } }),
      prisma.creditLedger.findMany({
        where: { wallet: { organizationId: member.organizationId } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          delta: true,
          reason: true,
          auth0Sub: true,
          requestId: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        organization: org,
        wallet,
        subscription,
        membersCount,
        role: member.role,
        ledger,
      },
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
