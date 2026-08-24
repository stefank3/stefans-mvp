import type { Metadata } from "next";
import TrustPage from "../TrustPage";
import { PRODUCT_NAME } from "@/lib/product/packageLabels";

export const metadata: Metadata = {
  title: `Trial Terms | ${PRODUCT_NAME}`,
};

export default function TrialTermsPage() {
  return (
    <TrustPage
      eyebrow="Trial Terms"
      title="Beta Access Terms"
      intro="Release Signal currently offers eligible accounts a 15-day, non-paying beta with 100 starting usage credits."
      sections={[
        {
          title: "Beta allowance",
          body: [
            "Beta duration: 15 days.",
            "Starting usage allowance: 100 credits.",
            "Payment required: No.",
            "Automatic paid conversion: No.",
          ],
        },
        {
          title: "Usage credits",
          body: [
            "Each eligible beta account starts with 100 usage credits. Credits represent the account's usage allowance for credit-based actions within Release Signal.",
            "AI-assisted actions that require credits may become unavailable once the available usage credits are exhausted.",
          ],
        },
        {
          title: "Payment and conversion",
          body: [
            "Beta access is currently non-paying. Payment details are not required for this beta, and beta access does not automatically convert into a paid subscription.",
          ],
        },
        {
          title: "End of the beta period",
          body: [
            "When the 15-day beta access period ends, continued access may be limited or may require a future access arrangement offered by Release Signal.",
          ],
        },
        {
          title: "Support",
          body: [
            "For questions about beta access or usage credits, contact contact@releasesignal.io.",
          ],
        },
      ]}
    />
  );
}
