import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx =
  | { params: { sessionId: string } }
  | { params: Promise<{ sessionId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const authSession = await auth0.getSession();
  const sub = authSession?.user?.sub;
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ✅ ALWAYS await params (works whether it's a Promise or plain object)
  const { sessionId } = await (ctx as any).params;

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId", debug: { params: await (ctx as any).params } },
      { status: 400 }
    );
  }

  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, auth0Sub: sub },
    select: { id: true },
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 120), 200);
  const cursor = url.searchParams.get("cursor");

  const rows = await prisma.chatMessage.findMany({
    where: { sessionId, auth0Sub: sub },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, role: true, content: true, createdAt: true },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items = page.slice().reverse().map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
  }));

  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({ items, nextCursor });
}
