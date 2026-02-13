import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/chat/history?cursor=...&limit=20
export async function GET(req: Request) {
  const authSession = await auth0.getSession();
  const sub = authSession?.user?.sub;
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const cursor = url.searchParams.get("cursor");

  // 1) Pull sessions first (cursor pagination)
  const sessions = await prisma.chatSession.findMany({
    where: { auth0Sub: sub },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      mode: true,
      createdAt: true,
    },
  });

  const hasMore = sessions.length > limit;
  const page = hasMore ? sessions.slice(0, limit) : sessions;
  const sessionIds = page.map((s) => s.id);

  // 2) Fetch latest message per session WITHOUT distinct (safe on all Prisma/PG combos)
  // We do N small queries in a transaction. For limit=25 this is fine and very stable.
  const lastMessages = await prisma.$transaction(
    sessionIds.map((sid) =>
      prisma.chatMessage.findFirst({
        where: { sessionId: sid, auth0Sub: sub },
        orderBy: { createdAt: "desc" },
        select: { sessionId: true, role: true, content: true, createdAt: true },
      })
    )
  );

  const lastBySessionId = new Map(
    lastMessages.filter(Boolean).map((m) => [m!.sessionId, m!])
  );

  return NextResponse.json({
    items: page.map((s) => {
      const last = lastBySessionId.get(s.id) ?? null;
      return {
        id: s.id,
        title: s.title ?? null,
        mode: s.mode,
        createdAt: s.createdAt,
        lastActivityAt: last?.createdAt ?? s.createdAt,
        lastMessage: last
          ? { role: last.role, content: last.content, createdAt: last.createdAt }
          : null,
      };
    }),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
