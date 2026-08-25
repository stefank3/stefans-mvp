import { PRODUCT_PACKAGE_NAMES } from "@/lib/product/packageLabels";

export const betaTrialHref =
  "/auth/login?screen_hint=signup&returnTo=%2Fchat";

export const contactEmail = "contact@releasesignal.io";

export const signInHref = "/auth/login?returnTo=%2Fchat";

export const primaryCtaLabel = "Start Trial";

export const betaMicrocopy =
  "15-day non-paying beta | 100 starting usage credits | No payment required";

export const guardrailCopy =
  "Release Signal provides QA assistance and release-readiness support, but it does not replace human QA judgment or final release approval.";

export const navLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: `mailto:${contactEmail}`, label: "Contact" },
];

export const trustLinks = [
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/trial-terms", label: "Trial Terms" },
  { href: "/refund-cancellation", label: "Refund / Cancellation" },
];

export const readinessSignals = [
  { label: "Requirement clarity", value: "Strong", width: "86%" },
  { label: "Risk coverage", value: "Needs review", width: "68%" },
  { label: "Execution evidence", value: "Partial", width: "54%" },
];

export const problemPoints = [
  "Requirements are scattered across tickets, documents, and chat.",
  "Test suites grow in volume without proving risk coverage.",
  "Review gaps remain invisible until late release conversations.",
  "Release calls are hard to explain when evidence is not structured.",
];

export const workflowSteps = [
  {
    title: "Refine the requirement",
    text: "Turn raw product intent into a QA-ready artifact with scope, acceptance criteria, risks, and open questions.",
  },
  {
    title: "Generate a test suite",
    text: "Create structured test cases that can be reviewed, improved, exported, and tied back to the requirement.",
  },
  {
    title: "Review coverage",
    text: "Inspect coverage, diagnostic value, risk focus, and test-design quality before execution work begins.",
  },
  {
    title: "Improve the plan",
    text: "Address review gaps while preserving the structured test-suite workflow.",
  },
  {
    title: "Export artifacts",
    text: "Export Release Signal artifacts as clean JSON or CSV for sharing, documentation, or manual mapping.",
  },
  {
    title: "Log execution evidence",
    text: "Submit structured execution outcomes without turning execution notes into test design truth.",
  },
  {
    title: "Get your readiness signal",
    text: "Use deterministic logic over current artifacts to produce a release-readiness signal for review.",
  },
];

export const features = [
  {
    title: "Requirement refinement",
    text: "Clarify scope, business rules, acceptance criteria, edge cases, risk areas, and unanswered questions.",
  },
  {
    title: "Structured test-suite generation",
    text: "Move from requirement intent to reviewable cases with priorities, steps, expected results, tags, and notes.",
  },
  {
    title: "Test-suite review",
    text: "Find weak diagnostics, missing risks, unclear expected results, and coverage gaps before execution.",
  },
  {
    title: "Plan improvement",
    text: "Strengthen coverage and clarity while keeping the suite structured, explainable, and reviewable.",
  },
  {
    title: "JSON / CSV export",
    text: "Take structured QA artifacts into downstream documentation, reporting, or manual QA workflows.",
  },
  {
    title: "Readiness signal",
    text: "Evaluate readiness through deterministic rules over requirements, suites, reviews, and execution evidence.",
  },
];

export const differentiators = [
  "AI assists with drafting, analysis, and summarization; structured artifacts remain the source of product truth.",
  "Generated outputs should be reviewed by the QA or release owner before they influence release planning.",
  "During beta, avoid uploading secrets or sensitive production/customer data unless terms explicitly allow it.",
];

export const pricingOptions = {
  beta: {
    status: "Current beta",
    name: "Beta access",
    price: "No payment required",
    details: ["15 days", "100 starting usage credits", "Non-paying beta"],
  },
  standard: {
    status: "Future paid plan",
    name: PRODUCT_PACKAGE_NAMES.standard,
    price: "€25/month",
    description:
      "Paid checkout and subscriptions are not currently active.",
  },
} as const;

export const faqs = [
  {
    question: "Is Release Signal just an AI test generator?",
    answer:
      "No. Test generation is one workflow step. Release Signal focuses on structured requirements, reviewable test suites, coverage review, execution evidence, exports, and a deterministic readiness signal.",
  },
  {
    question: "What is a release-readiness signal?",
    answer:
      "It is a structured signal derived from the current requirement, test suite, review result, and execution evidence. It supports the release conversation; it does not approve a release by itself.",
  },
  {
    question: "What do I get with beta access?",
    answer:
      "Accepted beta users receive 15-day beta access with 100 starting usage credits. No payment is required.",
  },
  {
    question: "Does Release Signal replace QA approval?",
    answer: guardrailCopy,
  },
  {
    question: "Can I export my work?",
    answer:
      "Yes. Release Signal supports JSON and CSV export for structured test-suite artifacts, intended for sharing, documentation, reporting, or manual mapping.",
  },
  {
    question: "Does it generate Playwright or Cypress code?",
    answer:
      "No. The current beta focuses on QA planning artifacts, review, execution evidence, export, and readiness support, not automation-code generation.",
  },
  {
    question: "Should I upload production secrets or sensitive customer data?",
    answer:
      "No. During beta, do not upload secrets, credentials, regulated data, or sensitive production/customer data unless the applicable terms explicitly allow it.",
  },
];
