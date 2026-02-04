"use client";

import { useState } from "react";

type Mode = "coach" | "review";

export default function ChatPage() {
  const [mode, setMode] = useState<Mode>("coach");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "bot"; text: string }[]>([]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, mode }),
    });

    const data = await res.json().catch(() => ({}));

    // REVIEW success: render scorecard-style output
    if (res.ok && data?.mode === "review" && data?.review) {
    const r = data.review;

    const lines = [
        `Score: ${r.score}/100`,
        `Verdict: ${r.verdict}`,
        "",
        "Breakdown:",
        `- Business relevance: ${r.breakdown.businessRelevance}/25`,
        `- Risk coverage: ${r.breakdown.riskCoverage}/25`,
        `- Design quality: ${r.breakdown.designQuality}/20`,
        `- Level & scope: ${r.breakdown.levelAndScope}/15`,
        `- Diagnostic value: ${r.breakdown.diagnosticValue}/15`,
        "",
        "Top risk gaps:",
        ...r.riskGaps.map((x: string) => `- ${x}`),
        "",
        "Anti-patterns:",
        ...r.antiPatterns.map((x: string) => `- ${x}`),
        "",
        "Prioritized improvements:",
        ...r.improvements.map((x: string) => `- ${x}`),
    ].join("\n");

    setMessages((m) => [...m, { role: "bot", text: lines }]);
    return;
    }

    // REVIEW parse/shape failure: show raw model output
    if (data?.mode === "review" && data?.raw) {
    setMessages((m) => [
        ...m,
        { role: "bot", text: `Review parsing issue:\n${data.error}\n\nRaw:\n${data.raw}` },
    ]);
    return;
    }

    // COACH or fallback
    setMessages((m) => [
    ...m,
    {
        role: "bot",
        text: res.ok
        ? (data?.reply ?? "No reply returned")
        : `API Error ${res.status}: ${JSON.stringify(data, null, 2)}`,
    },
]);

    setMessages((m) => [
      ...m,
      {
        role: "bot",
        text: res.ok
          ? (data?.reply ?? "No reply returned")
          : `API Error ${res.status}: ${JSON.stringify(data, null, 2)}`,
      },
    ]);
  };

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>QE Coach</h1>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => setMode("coach")} style={{ fontWeight: mode === "coach" ? 700 : 400 }}>
          Coach
        </button>
        <button onClick={() => setMode("review")} style={{ fontWeight: mode === "review" ? 700 : 400 }}>
          Review
        </button>
      </div>

      <div style={{ marginTop: 16, border: "1px solid #333", padding: 12, height: 420, overflow: "auto" }}>
        {messages.length === 0 ? (
          <p>Type a message to start.</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>{m.role === "user" ? "You" : "QE Coach"}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "review" ? "Paste test cases…" : "Describe the feature…"}
          style={{ flex: 1, padding: 8 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button onClick={send}>Send</button>
      </div>
    </main>
  );
}
