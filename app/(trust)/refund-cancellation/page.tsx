import type { Metadata } from "next";
import TrustPage from "../TrustPage";
import { PRODUCT_NAME } from "@/lib/product/packageLabels";

export const metadata: Metadata = {
  title: `Refund / Cancellation | ${PRODUCT_NAME}`,
};

export default function RefundCancellationPage() {
  return (
    <TrustPage
      eyebrow="Refund / Cancellation"
      title="Refund and Cancellation Policy"
      intro="This policy explains how refunds and cancellation apply to the current Release Signal beta."
      sections={[
        {
          title: "Current beta access",
          body: [
            "Current Release Signal beta access is non-paying. There is no paid subscription charge to refund for ordinary beta access.",
            "Normal paid-subscription cancellation is not part of the current beta lifecycle. The end, limitation, or loss of beta access is not a billing cancellation.",
          ],
        },
        {
          title: "Future paid services",
          body: [
            "If Release Signal introduces paid subscriptions, the applicable billing, renewal, cancellation, and refund terms will be provided as part of the relevant paid offering.",
          ],
        },
        {
          title: "Questions",
          body: [
            "For questions about this policy or beta access, contact contact@releasesignal.io.",
          ],
        },
      ]}
    />
  );
}
