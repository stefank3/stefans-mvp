/**
 * Review mode output contract.
 * The model MUST return JSON matching this shape (or we repair it).
 */
export type ReviewBreakdown = {
  businessRelevance: number; // 0-25
  riskCoverage: number;      // 0-25
  designQuality: number;     // 0-20
  levelAndScope: number;     // 0-15
  diagnosticValue: number;   // 0-15
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
export function isReviewResult(x: any): x is ReviewResult {
  return (
    x &&
    typeof x === "object" &&
    typeof x.score === "number" &&
    typeof x.verdict === "string" &&
    x.breakdown &&
    typeof x.breakdown.businessRelevance === "number" &&
    typeof x.breakdown.riskCoverage === "number" &&
    typeof x.breakdown.designQuality === "number" &&
    typeof x.breakdown.levelAndScope === "number" &&
    typeof x.breakdown.diagnosticValue === "number" &&
    Array.isArray(x.riskGaps) &&
    Array.isArray(x.antiPatterns) &&
    Array.isArray(x.improvements)
  );
}
