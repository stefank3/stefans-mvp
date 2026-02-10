import { auth0 } from "@/lib/auth0";

export default async function UserBar() {
  const session = await auth0.getSession();
  const email = (session?.user as { email?: string })?.email ?? "Unknown user";

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="opacity-80">{email}</span>
      <a
        href="/auth/logout"
        className="rounded-lg border px-3 py-2 hover:bg-white/10"
      >
        Logout
      </a>
    </div>
  );
}
