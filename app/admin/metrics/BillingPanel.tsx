"use client";

import { useEffect, useMemo, useState } from "react";

type Overview = {
  ok: boolean;
  organization: { id: string; name: string } | null;
  wallet: { balance: number; currency: string } | null;
  subscription: { status: string; planCode: string; seats: number; monthlyCredits: number } | null;
  membersCount: number;
  ledger: { id: string; delta: number; reason: string; requestId: string | null; createdAt: string }[];
};

export default function BillingPanel() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [topupAmount, setTopupAmount] = useState<number>(1000);
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/overview", { cache: "no-store" });
      const data = (await res.json()) as Overview;
      setOverview(data);
      if (!res.ok) setError((data as any)?.error ?? "Failed to load overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }

  async function topup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: topupAmount, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Top-up failed");
      } else {
        setNote("");
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Top-up failed");
    } finally {
      setBusy(false);
    }
  }

  const seatsText = useMemo(() => {
    const seats = overview?.subscription?.seats;
    if (!seats) return "—";
    return `${overview?.membersCount ?? 0}/${seats}`;
  }, [overview]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ border: "1px solid #333", borderRadius: 12, padding: 16, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Billing</h2>
        <button onClick={load} disabled={loading || busy}>
          Refresh
        </button>
      </div>

      {error ? (
        <p style={{ marginTop: 12 }}><b>Error:</b> {error}</p>
      ) : null}

      {loading ? (
        <p style={{ marginTop: 12 }}>Loading…</p>
      ) : (
        <>
          <div style={{ marginTop: 12, lineHeight: 1.6 }}>
            <div><b>Org:</b> {overview?.organization?.name ?? "—"}</div>
            <div><b>Plan:</b> {overview?.subscription?.planCode ?? "—"} ({overview?.subscription?.status ?? "—"})</div>
            <div><b>Seats:</b> {seatsText}</div>
            <div><b>Credits:</b> {overview?.wallet?.balance ?? 0}</div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="number"
              min={1}
              value={topupAmount}
              onChange={(e) => setTopupAmount(Math.max(1, parseInt(e.target.value || "1", 10)))}
              style={{ width: 140 }}
            />
            <input
              type="text"
              placeholder="note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: 260 }}
            />
            <button onClick={topup} disabled={busy || loading}>
              {busy ? "Topping up…" : "Top up"}
            </button>
          </div>

          <h3 style={{ marginTop: 16 }}>Recent ledger</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Time</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Delta</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Reason</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>RequestId</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.ledger ?? []).map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.delta}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.reason}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                      {row.requestId ? row.requestId.slice(0, 12) : "—"}
                    </td>
                  </tr>
                ))}
                {(overview?.ledger?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 8 }}>No ledger entries yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
