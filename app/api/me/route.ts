import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function GET() {
  const session = await auth0.getSession();

  if (!session?.user) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const email = (session.user as { email?: string }).email ?? "Unknown user";

  return NextResponse.json({ authenticated: true, email }, { status: 200 });
}
