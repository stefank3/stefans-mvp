/**
 * Review mode output contract.
 * The model MUST return JSON matching this shape (or we repair it).
 */
export type ReviewBreakdown = {
  businessRelevance: number; // 0-25
  riskCoverage: number; // 0-25
  designQuality: number; // 0-20
  levelAndScope: number; // 0-15
  diagnosticValue: number; // 0-15
};

export type ReviewResult = {
  score: number; // 0-100
  verdict: string; // e.g. "Weak – risk gaps present"
  breakdown: ReviewBreakdown;
  riskGaps: string[];
  antiPatterns: string[];
  improvements: string[];
};

/**
 * Minimal runtime validation to protect UI rendering.
 * (We keep it simple for MVP; later we can add zod.)
 */
export function isReviewResult(x: unknown): x is ReviewResult {
  if (typeof x !== "object" || x === null) return false;

  const r = x as Record<string, unknown>;
  const breakdown = r.breakdown as Record<string, unknown> | undefined;

  return (
    typeof r.score === "number" &&
    typeof r.verdict === "string" &&
    typeof breakdown === "object" &&
    breakdown !== null &&
    typeof breakdown.businessRelevance === "number" &&
    typeof breakdown.riskCoverage === "number" &&
    typeof breakdown.designQuality === "number" &&
    typeof breakdown.levelAndScope === "number" &&
    typeof breakdown.diagnosticValue === "number" &&
    Array.isArray(r.riskGaps) &&
    Array.isArray(r.antiPatterns) &&
    Array.isArray(r.improvements)
  );
}
