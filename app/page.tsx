"use client";

import { useState } from "react";

type Mode = "coach" | "review";

type ReviewBreakdown = {
  businessRelevance: number; // 0-25
  riskCoverage: number; // 0-25
  designQuality: number; // 0-20
  levelAndScope: number; // 0-15
  diagnosticValue: number; // 0-15
};

type ReviewResult = {
  score: number; // 0-100
  verdict: string;
  breakdown: ReviewBreakdown;
  riskGaps: string[];
  antiPatterns: string[];
  improvements: string[];
};

type ChatItem =
  | { kind: "text"; role: "user" | "bot"; text: string }
  | { kind: "review"; role: "bot"; review: ReviewResult }
  | { kind: "error"; role: "bot"; title: string; details: string };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function BarRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const safeValue = clamp(Number(value) || 0, 0, max);
  const pct = (safeValue / max) * 100;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 70px", gap: 12, alignItems: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>

      <div
        style={{
          height: 10,
          borderRadius: 999,
          border: "1px solid #ddd",
          overflow: "hidden",
          background: "#fafafa",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: "#111" }} />
      </div>

      <div style={{ fontSize: 13, textAlign: "right" }}>
        {safeValue}/{max}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #ddd",
        fontSize: 12,
        background: "#fff",
      }}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "#666" }}>None.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((x, i) => (
            <li key={i} style={{ fontSize: 13, marginBottom: 6, lineHeight: 1.35 }}>
              {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewResult }) {
  const score = clamp(Number(review.score) || 0, 0, 100);

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 14,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Review Score</div>
          <div style={{ fontSize: 13, color: "#444" }}>{review.verdict}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chip>
            <span style={{ fontWeight: 800 }}>{score}</span>/100
          </Chip>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <BarRow label="Business relevance" value={review.breakdown.businessRelevance} max={25} />
        <BarRow label="Risk coverage" value={review.breakdown.riskCoverage} max={25} />
        <BarRow label="Design quality" value={review.breakdown.designQuality} max={20} />
        <BarRow label="Level & scope" value={review.breakdown.levelAndScope} max={15} />
        <BarRow label="Diagnostic value" value={review.breakdown.diagnosticValue} max={15} />
      </div>

      <Section title="Top risk gaps" items={review.riskGaps} />
      <Section title="Anti-patterns" items={review.antiPatterns} />
      <Section title="Prioritized improvements" items={review.improvements} />
    </div>
  );
}

export default function ChatPage() {
  const [mode, setMode] = useState<Mode>("coach");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isSending, setIsSending] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setItems((prev) => [...prev, { kind: "text", role: "user", text }]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, mode }),
      });

      const data = await res.json().catch(() => ({}));

      // REVIEW success: structured payload
      if (res.ok && data?.mode === "review" && data?.review) {
        setItems((prev) => [...prev, { kind: "review", role: "bot", review: data.review as ReviewResult }]);
        return;
      }

      // REVIEW parse/shape failure: show raw output for debugging/demo reliability
      if (data?.mode === "review" && data?.raw) {
        setItems((prev) => [
          ...prev,
          { kind: "error", role: "bot", title: data?.error ?? "Review parsing issue", details: String(data.raw) },
        ]);
        return;
      }

      // COACH normal reply
      if (res.ok) {
        setItems((prev) => [...prev, { kind: "text", role: "bot", text: data?.reply ?? "No reply returned" }]);
        return;
      }

      // API error (non-200)
      setItems((prev) => [
        ...prev,
        {
          kind: "error",
          role: "bot",
          title: `API Error ${res.status}`,
          details: JSON.stringify(data, null, 2),
        },
      ]);
    } catch (e: any) {
      setItems((prev) => [
        ...prev,
        { kind: "error", role: "bot", title: "Network/Client error", details: e?.message ?? String(e) },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Stefan’s MVP — QE Coach</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Chip>Mode: {mode === "coach" ? "Coach" : "Review"}</Chip>
        <button
          onClick={() => setMode("coach")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "coach" ? "#111" : "#fff",
            color: mode === "coach" ? "#fff" : "#111",
            fontWeight: 700,
          }}
        >
          Coach
        </button>
        <button
          onClick={() => setMode("review")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "review" ? "#111" : "#fff",
            color: mode === "review" ? "#fff" : "#111",
            fontWeight: 700,
          }}
        >
          Review
        </button>
        <button
          onClick={() => setItems([])}
          style={{
            marginLeft: "auto",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            fontWeight: 700,
          }}
        >
          Clear
        </button>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 14,
          height: "62vh",
          overflow: "auto",
          background: "#fafafa",
        }}
      >
        {items.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>
            {mode === "coach"
              ? "Describe a feature. I’ll ask clarifying questions before suggesting tests."
              : "Paste test cases or a test plan. I’ll return a score + breakdown + improvements."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((it, idx) => {
              if (it.kind === "text") {
                const isUser = it.role === "user";
                return (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "78%",
                        border: "1px solid #ddd",
                        borderRadius: 12,
                        padding: 12,
                        background: isUser ? "#111" : "#fff",
                        color: isUser ? "#fff" : "#111",
                        whiteSpace: "pre-wrap",
                        fontSize: 13,
                        lineHeight: 1.4,
                      }}
                    >
                      {it.text}
                    </div>
                  </div>
                );
              }

              if (it.kind === "review") {
                return <ReviewCard key={idx} review={it.review} />;
              }

              // error
              return (
                <div
                  key={idx}
                  style={{
                    border: "1px solid #f0c",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{it.title}</div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>{it.details}</pre>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "review" ? "Paste test cases / test plan…" : "Describe the feature / workflow…"}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          disabled={isSending}
        />
        <button
          onClick={send}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontWeight: 800,
            opacity: isSending ? 0.7 : 1,
          }}
          disabled={isSending}
        >
          {isSending ? "Sending…" : "Send"}
        </button>
      </div>
    </main>
  );
}
