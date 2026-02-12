"use client";

import { useEffect, useMemo, useState } from "react";

type MetricsResponse =
  | {
      ok: true;
      windowMinutes: number;
      totals: {
        total: number;
        coach: number;
        review: number;
        unknown: number;
        status: Record<string, number>;
        rateLimited: number;
        avgLatencyMs: number;
      };
      series: Array<{
        bucketSeconds: number;
        total: number;
        coach: number;
        review: number;
        status200: number;
        status403: number;
        status429: number;
        status500: number;
        rateLimited: number;
        avgLatencyMs: number;
      }>;
    }
  | { ok: false; error: string };

function formatBucket(tsSeconds: number) {
  // Local time label: HH:MM
  const d = new Date(tsSeconds * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AdminMetricsPage() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        // IMPORTANT: this must match your route handler path
        // app/api/admin/metrics/route.ts => /api/admin/metrics
        const res = await fetch("/api/admin/metrics", { cache: "no-store" });
        const json = (await res.json()) as MetricsResponse;

        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ ok: false, error: "Failed to load metrics" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(() => {
    if (!data) return "Admin Metrics";
    if (!data.ok) return "Admin Metrics";
    return `Admin Metrics (last ${data.windowMinutes} minutes)`;
  }, [data]);

  return (
      <main
        style={{
          padding: 24,
          maxWidth: 1100,
          margin: "0 auto",
          background: "#f5f6f8", // light background
          minHeight: "100vh",    // full page coverage
          color: "#111",
        }}
      >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{title}</h1>
        <a
          href="/chat"
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            textDecoration: "none",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          Back to chat
        </a>
      </div>

      <div style={{ marginTop: 12, color: "#444", fontSize: 13 }}>
        Admin-only endpoint: <code>/api/admin/metrics</code>
      </div>

      {loading && <div style={{ marginTop: 16, fontSize: 13, color: "#444" }}>Loading…</div>}

      {!loading && data && !data.ok && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #f0c",
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Error</div>
          <div style={{ fontSize: 13 }}>{data.error}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
            If you see “Forbidden”, your user is not admin or roles claim isn’t present.
          </div>
        </div>
      )}

      {!loading && data && data.ok && (
        <>
          {/* Totals */}
          <div
            style={{
              marginTop: 16,
              border: "1px solid #ddd",
              borderRadius: 14,
              padding: 14,
              background: "#fff",
              boxShadow: "0 6px 22px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>Totals</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <Stat label="Total requests" value={data.totals.total} />
              <Stat label="Coach" value={data.totals.coach} />
              <Stat label="Review" value={data.totals.review} />
              <Stat label="Avg latency (ms)" value={data.totals.avgLatencyMs} />
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <Stat label="Rate limited (429)" value={data.totals.rateLimited} />
              <Stat label="403 Forbidden" value={Number(data.totals.status["403"] ?? 0)} />
              <Stat label="500 Errors" value={Number(data.totals.status["500"] ?? 0)} />
              <Stat label="200 OK" value={Number(data.totals.status["200"] ?? 0)} />
            </div>
          </div>

          {/* Series table */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>Series (5-min buckets)</div>

            <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    <Th>Time</Th>
                    <Th>Total</Th>
                    <Th>Coach</Th>
                    <Th>Review</Th>
                    <Th>200</Th>
                    <Th>403</Th>
                    <Th>429</Th>
                    <Th>500</Th>
                    <Th>Avg ms</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map((row) => (
                    <tr key={row.bucketSeconds}>
                      <Td>{formatBucket(row.bucketSeconds)}</Td>
                      <Td>{row.total}</Td>
                      <Td>{row.coach}</Td>
                      <Td>{row.review}</Td>
                      <Td>{row.status200}</Td>
                      <Td>{row.status403}</Td>
                      <Td>{row.status429}</Td>
                      <Td>{row.status500}</Td>
                      <Td>{row.avgLatencyMs}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontSize: 12, color: "#555", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: 10, fontSize: 12, fontWeight: 900, borderBottom: "1px solid #eee" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: 10, fontSize: 13, borderBottom: "1px solid #f3f3f3" }}>{children}</td>;
}
