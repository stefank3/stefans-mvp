// /lib/auth0.ts
import "server-only";

import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  bindSignupIntentToSubject,
  deletePendingSignupIntent,
  isSignupIntentCallbackMarker,
  parseSignupIntentCallbackMarker,
  SIGNUP_INTENT_COOKIE_NAME,
  signupIntentCookieOptions,
} from "@/lib/auth/signupIntent";

/**
 * Central Auth0 client.
 * - Server-only
 * - Uses validated env config
 * - Routes import { auth0 } from "@/lib/auth0"
 */
export const auth0 = new Auth0Client({
  // REQUIRED in @auth0/nextjs-auth0 v4
  appBaseUrl: env.APP_BASE_URL,

  // Optional: keep authorization params centralized
  authorizationParameters: {
    audience: "https://stefans-mvp-api", // must match Auth0 API Identifier
    scope: "openid profile email",
  },

  onCallback: async (error, ctx, session) => {
    const isSignupCallback = isSignupIntentCallbackMarker(ctx.returnTo);
    const signupIntentNonce = parseSignupIntentCallbackMarker(ctx.returnTo);

    if (error) {
      if (signupIntentNonce) {
        await deletePendingSignupIntent(signupIntentNonce);
      }

      // Preserve the SDK's default callback error behavior for normal sign-in.
      return new NextResponse(error.message, { status: 500 });
    }

    if (!isSignupCallback) {
      return NextResponse.redirect(new URL(ctx.returnTo || "/", env.APP_BASE_URL));
    }

    if (!signupIntentNonce) {
      return NextResponse.json(
        { error: "account_not_provisioned" },
        { status: 403 }
      );
    }

    const auth0Sub = session?.user?.sub;
    if (typeof auth0Sub !== "string" || !auth0Sub) {
      await deletePendingSignupIntent(signupIntentNonce);
      return NextResponse.json(
        { error: "account_not_provisioned" },
        { status: 403 }
      );
    }

    const binding = await bindSignupIntentToSubject(signupIntentNonce, auth0Sub);
    if (!binding.ok) {
      return NextResponse.json(
        {
          error:
            binding.reason === "unavailable"
              ? "account_provisioning_unavailable"
              : "account_not_provisioned",
        },
        { status: binding.reason === "unavailable" ? 503 : 403 }
      );
    }

    const response = NextResponse.redirect(new URL("/chat", env.APP_BASE_URL));
    response.cookies.set(
      SIGNUP_INTENT_COOKIE_NAME,
      signupIntentNonce,
      signupIntentCookieOptions(binding.expiresInSeconds)
    );
    return response;
  },
});
