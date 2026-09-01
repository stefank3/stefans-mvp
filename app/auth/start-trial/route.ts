export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import {
  buildSignupIntentCallbackMarker,
  createPendingSignupIntent,
  deletePendingSignupIntent,
} from "@/lib/auth/signupIntent";

export async function GET() {
  let nonce: string | null = null;

  try {
    nonce = await createPendingSignupIntent();

    return await auth0.startInteractiveLogin({
      authorizationParameters: {
        screen_hint: "signup",
      },
      returnTo: buildSignupIntentCallbackMarker(nonce),
    });
  } catch {
    if (nonce) {
      await deletePendingSignupIntent(nonce);
    }

    return NextResponse.json(
      { error: "account_provisioning_unavailable" },
      { status: 503 }
    );
  }
}
