import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx =
  | { params: { sessionId: string } }
  | { params: Promise<{ sessionId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const authSession = await auth0.getSession();
    const sub = authSession?.user?.sub;
    if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ ALWAYS await params (works for both Promise + plain object)
    const { sessionId } = await (ctx as any).params;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId", debug: { params: await (ctx as any).params } },
        { status: 400 }
      );
    }

    // ✅ Safe JSON parsing
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 80) {
      return NextResponse.json({ error: "Invalid title" }, { status: 400 });
    }

    // ✅ Ownership check
    const existing = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, auth0Sub: true },
    });

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.auth0Sub !== sub) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title },
    });

    return NextResponse.json({ ok: true, sessionId, title });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Internal error", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
