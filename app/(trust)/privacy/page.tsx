import type { Metadata } from "next";
import TrustPage from "../TrustPage";
import { PRODUCT_NAME } from "@/lib/product/packageLabels";

export const metadata: Metadata = {
  title: `Privacy | ${PRODUCT_NAME}`,
};

export default function PrivacyPage() {
  return (
    <TrustPage
      eyebrow="Privacy"
      title="Privacy Notice"
      intro="This notice explains the information Release Signal may process to provide and operate its QA, test-design, and release-readiness service."
      sections={[
        {
          title: "Information we process",
          body: [
            "Release Signal may process account and identity information, authentication and account metadata, organization or workspace information, and service usage information needed to operate the product.",
            "We may also process requirements, test artifacts, reviews, execution evidence, and other workspace content submitted by users.",
          ],
        },
        {
          title: "Authentication",
          body: [
            "Release Signal uses Auth0 to provide authentication. Auth0 and related service providers may process authentication and account metadata as needed to sign users in and protect account access.",
          ],
        },
        {
          title: "AI-assisted functionality",
          body: [
            "Workspace content may be sent to and processed by AI or model providers when needed to provide AI-assisted features.",
            "Users should review submitted content and avoid including information that is not necessary for their QA work.",
          ],
        },
        {
          title: "Service providers",
          body: [
            "Infrastructure, hosting, authentication, database, AI or model, and related service providers may process information as needed to operate, secure, and support Release Signal.",
          ],
        },
        {
          title: "Sensitive content",
          body: [
            "Do not submit passwords, API keys, private keys, production secrets, or regulated or sensitive information that is not necessary for QA work.",
            "Release Signal is not intended to be a secret manager or a system for storing regulated records.",
          ],
        },
        {
          title: "Security and retention",
          body: [
            "Release Signal uses reasonable technical and operational safeguards intended to protect information and operate the service securely. No system can guarantee complete security.",
            "Information may be retained as necessary to operate and support the service, meet legitimate business and security needs, resolve disputes, or comply with legal obligations.",
          ],
        },
        {
          title: "Questions and requests",
          body: [
            "For privacy questions or requests concerning your information, contact contact@releasesignal.io.",
          ],
        },
      ]}
    />
  );
}
