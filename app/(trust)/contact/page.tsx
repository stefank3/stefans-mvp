import type { Metadata } from "next";
import TrustPage from "../TrustPage";
import { PRODUCT_NAME } from "@/lib/product/packageLabels";

export const metadata: Metadata = {
  title: `Contact | ${PRODUCT_NAME}`,
};

export default function ContactPage() {
  return (
    <TrustPage
      eyebrow="Contact"
      title="Contact Release Signal"
      intro="Get in touch with Release Signal for product, account, or policy questions."
      sections={[
        {
          title: "How to contact us",
          body: [
            "Email contact@releasesignal.io for product or support questions, beta access or account questions, and questions about our privacy notice or terms.",
          ],
        },
        {
          title: "About Release Signal",
          body: [
            "Release Signal provides AI-assisted QA, test-design, and release-readiness functionality.",
          ],
        },
      ]}
    />
  );
}
