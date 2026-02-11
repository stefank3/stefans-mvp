"use client";

import { useEffect, useMemo, useState } from "react";
import UserBar from "./UserBar";

/**
 * Chat modes:
 * - coach: model asks clarifying questions + proposes a small, high-signal test approach
 * - review: model returns structured JSON with score/breakdown/gaps/improvements
 */
type Mode = "coach" | "review";

/** Review breakdown component scores (max caps are part of the scoring model). */
type ReviewBreakdown = {
  businessRelevance: number; // 0-25
  riskCoverage: number; // 0-25
  designQuality: number; // 0-20
  levelAndScope: number; // 0-15
  diagnosticValue: number; // 0-15
};

/** Structured output returned by the API in review mode. */
type ReviewResult = {
  score: number; // 0-100
  verdict: string;
  breakdown: ReviewBreakdown;
  riskGaps: string[];
  antiPatterns: string[];
  improvements: string[];
};

/**
 * UI message model:
 * - text: normal user/bot chat messages
 * - review: structured scorecard output
 * - error: API/runtime errors shown to the user
 */
type ChatItem =
  | { kind: "text"; role: "user" | "bot"; text: string }
  | { kind: "review"; role: "bot"; review: ReviewResult }
  | { kind: "error"; role: "bot"; title: string; details: string };

type PersistedState = {
  mode: Mode;
  items: ChatItem[];
  input: string;
};

/**
 * Rate limit metadata (Step 2C)
 * Returned by the API on success + on 429.
 */
type RateMeta = {
  limit: number;
  remaining: number;
  resetSeconds: number;
};

type MeResponse =
  | { authenticated: true; email: string; roles: string[]; isAdmin: boolean }
  | { authenticated: false };

/** Local storage key (so reload keeps the demo context). */
const STORAGE_KEY = "stefans-mvp-chat-v1";

/** Clamp helper to keep UI stable even if model returns values out of expected range. */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Minimal markdown safety for list items (Jira/Confluence paste). */
function mdSafe(s: string) {
  return String(s ?? "").replace(/\r/g, "").trim();
}

/**
 * Convert review result to Markdown so it can be pasted into Jira/Confluence.
 * This is the "human-friendly export".
 */
function reviewToMarkdown(r: ReviewResult) {
  const b = r.breakdown;

  const lines: string[] = [];
  lines.push("## QE Review");
  lines.push(`**Score:** ${r.score}/100`);
  lines.push(`**Verdict:** ${mdSafe(r.verdict)}`);
  lines.push("");

  lines.push("### Breakdown");
  lines.push(`- Business relevance: ${b.businessRelevance}/25`);
  lines.push(`- Risk coverage: ${b.riskCoverage}/25`);
  lines.push(`- Design quality: ${b.designQuality}/20`);
  lines.push(`- Level & scope: ${b.levelAndScope}/15`);
  lines.push(`- Diagnostic value: ${b.diagnosticValue}/15`);
  lines.push("");

  const addList = (title: string, items: string[]) => {
    lines.push(`### ${title}`);
    if (!items || items.length === 0) {
      lines.push("- None");
    } else {
      for (const it of items) lines.push(`- ${mdSafe(it)}`);
    }
    lines.push("");
  };

  addList("Top risk gaps", r.riskGaps);
  addList("Anti-patterns", r.antiPatterns);
  addList("Prioritized improvements", r.improvements);

  return lines.join("\n");
}

/**
 * Convert review result to JSON (pretty printed).
 * This is the "machine-friendly export" for future integrations.
 */
function reviewToJson(r: ReviewResult) {
  return JSON.stringify(r, null, 2);
}

/** Breakdown row with a progress bar (simple MVP UI, no external libs). */
function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const safeValue = clamp(Number(value) || 0, 0, max);
  const pct = (safeValue / max) * 100;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 70px", gap: 12, alignItems: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{label}</div>

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

      <div style={{ fontSize: 13, textAlign: "right", color: "#111" }}>
        {safeValue}/{max}
      </div>
    </div>
  );
}

/** Small pill label used in header sections (dark background friendly). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.22)",
        fontSize: 12,
        background: "rgba(255,255,255,0.06)",
        color: "#fff",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Header button style for Coach/Review/Clear and demo actions.
 * - active gives a stronger background to show selection.
 */
function HeaderButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.22)",
        background: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
        color: "#fff",
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** Small button used inside review cards (Copy MD / Copy JSON). */
function SmallButton({
  children,
  onClick,
  variant = "light",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 10px",
        borderRadius: 10,
        border: isDark ? "1px solid #111" : "1px solid #ddd",
        background: isDark ? "#111" : "#fff",
        color: isDark ? "#fff" : "#111",
        fontWeight: 900,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** Reusable list section for gaps/anti-patterns/improvements. */
function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: "#111" }}>{title}</div>

      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "#666" }}>None.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((x, i) => (
            <li key={i} style={{ fontSize: 13, marginBottom: 6, lineHeight: 1.35, color: "#111" }}>
              {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Review UI card for structured scoring output.
 * Includes Copy MD + Copy JSON with a small toast notification (no alerts).
 */
function ReviewCard({ review }: { review: ReviewResult }) {
  const score = clamp(Number(review.score) || 0, 0, 100);

  const grade =
    score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 60 ? "Fair" : score >= 40 ? "Weak" : "Poor";

  const [toast, setToast] = useState<string | null>(null);

  /** Auto-hide toast after 1.2 seconds for a clean UX. */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1200);
    return () => clearTimeout(t);
  }, [toast]);

  /** Copies text to clipboard using the browser clipboard API. */
  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label} copied ✓`);
    } catch {
      setToast("Copy failed (clipboard blocked)");
    }
  };

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 16,
        padding: 16,
        background: "#fff",
        boxShadow: "0 6px 22px rgba(0,0,0,0.06)",
        color: "#111",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 0.2 }}>Review Score</div>
          <div style={{ fontSize: 13, color: "#444", lineHeight: 1.35 }}>{review.verdict}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <SmallButton onClick={() => copyText(reviewToMarkdown(review), "Markdown")}>Copy MD</SmallButton>
            <SmallButton onClick={() => copyText(reviewToJson(review), "JSON")} variant="dark">
              Copy JSON
            </SmallButton>
          </div>

          <div
            style={{
              border: "1px solid #111",
              borderRadius: 999,
              padding: "8px 12px",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            {score}/100
          </div>

          <div style={{ fontSize: 12, color: "#666" }}>{grade}</div>
        </div>
      </div>

      {toast && (
        <div
          style={{
            marginTop: 10,
            display: "inline-block",
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {toast}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          border: "1px solid #eee",
          borderRadius: 14,
          padding: 12,
          background: "#fafafa",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: "#333" }}>Breakdown</div>
        <BarRow label="Business relevance" value={review.breakdown.businessRelevance} max={25} />
        <BarRow label="Risk coverage" value={review.breakdown.riskCoverage} max={25} />
        <BarRow label="Design quality" value={review.breakdown.designQuality} max={20} />
        <BarRow label="Level & scope" value={review.breakdown.levelAndScope} max={15} />
        <BarRow label="Diagnostic value" value={review.breakdown.diagnosticValue} max={15} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginTop: 14 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fff" }}>
          <Section title="Top risk gaps" items={review.riskGaps} />
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fff" }}>
          <Section title="Anti-patterns" items={review.antiPatterns} />
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fff" }}>
          <Section title="Prioritized improvements" items={review.improvements} />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [mode, setMode] = useState<Mode>("coach");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isSending, setIsSending] = useState(false);

  /** Friendly banner message (shown when API returns 429). */
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);

  /** Last seen rate meta from the server (success or 429). */
  const [rate, setRate] = useState<RateMeta | null>(null);

  // ✅ RBAC: load current user + roles once for UI gating
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        setMe((await res.json()) as MeResponse);
      } catch {
        setMe({ authenticated: false });
      }
    })();
  }, []);

  const isAdmin = !!(me && me.authenticated && me.isAdmin);

  // ---- Local persistence (demo-friendly) ------------------------------------

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedState;

      if (parsed?.mode) setMode(parsed.mode);
      if (Array.isArray(parsed.items)) setItems(parsed.items);
      if (typeof parsed.input === "string") setInput(parsed.input);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const payload: PersistedState = { mode, items, input };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [mode, items, input]);

  // ✅ If a non-admin loads persisted Review mode, force back to Coach
  useEffect(() => {
    if (me && (!me.authenticated || !me.isAdmin) && mode === "review") {
      setMode("coach");
    }
  }, [me, mode]);

  // Auto-hide banner after 4s
  useEffect(() => {
    if (!rateLimitMsg) return;
    const t = setTimeout(() => setRateLimitMsg(null), 4000);
    return () => clearTimeout(t);
  }, [rateLimitMsg]);

  // ---- Demo prompts (one-click) --------------------------------------------

  const DEMO_COACH_LOGIN = `Feature: Login with Auth0, optional MFA

Context:
- Username/password login via Auth0 Universal Login
- MFA optional based on user policy
- Web app + API backend
- Lockout policy: 5 failed attempts -> 15 min lock

Ask:
Help me design a risk-based test strategy and a small set of high-signal tests.`;

  const DEMO_REVIEW_LOGIN = `Feature: Login with Auth0, optional MFA

TC1: Valid login (no MFA) should succeed
Steps: open login page, enter valid creds, submit
Expected: redirected to dashboard

TC2: Invalid password shows error
Steps: enter valid username + wrong password
Expected: error message, no redirect

TC3: MFA required for some users
Steps: login as user with MFA enabled
Expected: MFA challenge shown, on success redirect

TC4: MFA failure
Steps: enter wrong OTP
Expected: error, allow retry, no login`;

  const DEMO_REVIEW_EXPORT = `Feature: Export search results (CSV)

TC1: Export CSV for filtered results
Steps:
1. Apply filters (Market=Austria, Status=Active)
2. Click Export -> CSV
3. Wait for completion
Expected:
- File downloads
- Filename includes timestamp
- Contains headers + correct number of rows

TC2: Export limit is enforced
Steps: Filter to >100k rows, export CSV
Expected: user sees clear error, export not started

TC3: Cancel export
Steps: Start export, click Cancel
Expected: export stops, no file downloaded, status resets`;

  const loadDemo = (demoMode: Mode, text: string) => {
    if (demoMode === "review" && !isAdmin) return;
    setMode(demoMode);
    setInput(text);
  };

  // ---- API interaction ------------------------------------------------------

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

      if (data?.rate) setRate(data.rate as RateMeta);

      if (res.status === 429) {
        setRateLimitMsg(data?.details ?? "Rate limit reached. Please try again shortly.");
        setItems((prev) => prev.slice(0, -1));
        return;
      }

      if (res.status === 403) {
        setItems((prev) => [
          ...prev,
          {
            kind: "error",
            role: "bot",
            title: "Forbidden",
            details: "Review mode is admin-only.",
          },
        ]);
        return;
      }

      setRateLimitMsg(null);

      if (res.ok && data?.mode === "review" && data?.review) {
        setItems((prev) => [...prev, { kind: "review", role: "bot", review: data.review as ReviewResult }]);
        return;
      }

      if (data?.mode === "review" && data?.raw) {
        setItems((prev) => [
          ...prev,
          { kind: "error", role: "bot", title: data?.error ?? "Review parsing issue", details: String(data.raw) },
        ]);
        return;
      }

      if (res.ok) {
        setItems((prev) => [...prev, { kind: "text", role: "bot", text: data?.reply ?? "No reply returned" }]);
        return;
      }

      setItems((prev) => [
        ...prev,
        { kind: "error", role: "bot", title: `API Error ${res.status}`, details: JSON.stringify(data, null, 2) },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);

      setItems((prev) => [
        ...prev,
        {
          kind: "error",
          role: "bot",
          title: "Network/Client error",
          details: message,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // ---- UI helpers -----------------------------------------------------------

  const rateChipText = useMemo(() => {
    if (!rate) return null;
    return `Rate: ${rate.remaining}/${rate.limit} · resets in ${rate.resetSeconds}s`;
  }, [rate]);

  const mainStyle: React.CSSProperties = {
    padding: 24,
    maxWidth: 980,
    margin: "0 auto",
    color: "#fff",
    background: "radial-gradient(900px 360px at 50% -120px, rgba(255,255,255,0.12), rgba(0,0,0,0))",
  };

  const chatBoxStyle: React.CSSProperties = {
    border: "1px solid #ddd",
    borderRadius: 14,
    padding: 14,
    height: "62vh",
    overflow: "auto",
    background: "#fafafa",
  };

  return (
    <main style={mainStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Stefan’s MVP — QE Coach</h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Chip>Demo</Chip>
        <HeaderButton onClick={() => loadDemo("coach", DEMO_COACH_LOGIN)}>Coach: Login + MFA</HeaderButton>

        {isAdmin && (
          <>
            <HeaderButton onClick={() => loadDemo("review", DEMO_REVIEW_LOGIN)}>Review: Login + MFA</HeaderButton>
            <HeaderButton onClick={() => loadDemo("review", DEMO_REVIEW_EXPORT)}>Review: Export CSV</HeaderButton>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Chip>Mode: {mode === "coach" ? "Coach" : "Review"}</Chip>

        {rateChipText && <Chip>{rateChipText}</Chip>}

        <HeaderButton active={mode === "coach"} onClick={() => setMode("coach")}>
          Coach
        </HeaderButton>

        <HeaderButton
          active={mode === "review"}
          onClick={() => setMode("review")}
          disabled={!isAdmin}
        >
          Review {!isAdmin ? "🔒" : ""}
        </HeaderButton>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <UserBar />

          <HeaderButton
            onClick={() => {
              setItems([]);
              setInput("");
              setRate(null);
              setRateLimitMsg(null);
              localStorage.removeItem(STORAGE_KEY);
            }}
          >
            Clear
          </HeaderButton>
        </div>
      </div>

      {rateLimitMsg && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.22)",
            background: "rgba(255,255,255,0.08)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {rateLimitMsg}
        </div>
      )}

      <div style={chatBoxStyle}>
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
                  <div key={idx} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
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

              if (it.kind === "review") return <ReviewCard key={idx} review={it.review} />;

              return (
                <div
                  key={idx}
                  style={{
                    border: "1px solid #f0c",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fff",
                    color: "#111",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>{it.title}</div>
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
            color: "#111",
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
            fontWeight: 900,
            opacity: isSending ? 0.7 : 1,
            cursor: "pointer",
          }}
          disabled={isSending}
        >
          {isSending ? "Sending…" : "Send"}
        </button>
      </div>
    </main>
  );
}
