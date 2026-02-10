import { Auth0Client } from "@auth0/nextjs-auth0/server";

// v4 SDK reads config from env vars by default
export const auth0 = new Auth0Client();
