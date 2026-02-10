## Stefan’s MVP — QA Chatbot Coach

A production-style MVP that provides a QA-focused chatbot with two modes:

- **Coach mode**: asks clarifying questions when needed and proposes a risk-based test strategy + a small set of high-signal tests.
- **Review mode (admin-only)**: scores and critiques a user-provided test approach and returns structured JSON for a scorecard UI.

This project is built to demonstrate **real-world delivery concerns** (auth, abuse protection, cost control, deployability), not just a demo UI.

---

## Key Features

- **Auth-protected app (Auth0)**: users must authenticate to access the UI and the API.
- **Global rate limiting (Upstash Redis)**: server-side, cross-instance limits to prevent abuse and control costs.
- **Per-user throttling**: rate limiting is keyed by authenticated user identity (not just IP).
- **Cost controls**: output token caps are enforced per request.
- **Structured “review” contract**: review mode returns validated JSON to power a scorecard UI.

---

## Tech Stack

- **Next.js (App Router)** + TypeScript
- **Auth0** for authentication and sessions
- **Upstash Redis** for global rate limiting
- **OpenAI API** for completions
- ESLint / TypeScript strictness for production hygiene

---

## Local Development

### 1) Install dependencies
```bash
npm install
