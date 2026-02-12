"use client";

import { useEffect, useState } from "react";

type MeResponse =
  | { authenticated: true; email: string; isAdmin: boolean }
  | { authenticated: false };

export default function UserBar() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const data = (await res.json()) as MeResponse;
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) setMe({ authenticated: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!me) return <div className="text-sm opacity-70">Loading…</div>;
  if (!me.authenticated) return null;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="opacity-80">{me.email}</span>

      {me.isAdmin && (
        <a href="/admin/metrics" className="rounded-lg border px-3 py-2 hover:bg-white/10">
          Metrics
        </a>
      )}

      <a href="/auth/logout" className="rounded-lg border px-3 py-2 hover:bg-white/10">
        Logout
      </a>
    </div>
  );
}
