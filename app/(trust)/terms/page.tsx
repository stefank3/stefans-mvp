import type { Metadata } from "next";
import TrustPage from "../TrustPage";
import { PRODUCT_NAME } from "@/lib/product/packageLabels";

export const metadata: Metadata = {
  title: `Terms | ${PRODUCT_NAME}`,
};

export default function TermsPage() {
  return (
    <TrustPage
      eyebrow="Terms"
      title="Terms of Use"
      intro="These Terms of Use apply to the current non-paying Release Signal beta. By using the service, you agree to use it responsibly and in accordance with these terms."
      sections={[
        {
          title: "Service purpose",
          body: [
            "Release Signal provides AI-assisted QA, test-design, execution-evidence, and release-readiness functionality.",
            "Release Signal does not guarantee defect-free releases, complete test coverage, or any particular release decision.",
          ],
        },
        {
          title: "Beta service",
          body: [
            "Release Signal is currently beta software. Features may change, contain defects, experience interruptions, or evolve before a future paid or commercial release.",
            "Current beta access is non-paying and does not include a production service-level commitment or a promise of continuous availability.",
          ],
        },
        {
          title: "Acceptable use",
          body: [
            "Users should use the service for lawful QA, product, testing, and release-readiness work.",
            "Users should not attempt to abuse, overload, bypass access controls, reverse engineer protected systems, upload malicious content, or use the service to process content they are not authorized to share.",
          ],
        },
        {
          title: "User content",
          body: [
            "Users remain responsible for the content they submit and must have the rights and authority needed to provide that content to Release Signal for processing.",
          ],
        },
        {
          title: "AI-assisted output and release responsibility",
          body: [
            "AI-assisted outputs can be incomplete or incorrect. Users must review and validate outputs before relying on them.",
            "Release Signal output does not independently substitute for qualified human review where that review is required. Release decisions remain the responsibility of the user or the user's organization.",
          ],
        },
        {
          title: "Accounts and security",
          body: [
            "Users are responsible for taking reasonable steps to protect their accounts and for activity performed through their accounts. Suspected unauthorized access should be reported to contact@releasesignal.io.",
          ],
        },
        {
          title: "Intellectual property",
          body: [
            "Release Signal and its software, product design, and related materials remain the property of their respective owner or licensors.",
            "Users retain responsibility for and any rights they hold in content they submit. These terms do not transfer ownership of user-provided content to Release Signal.",
          ],
        },
        {
          title: "Availability, changes, and access",
          body: [
            "Beta features may be changed, limited, suspended, or withdrawn. Release Signal may limit or terminate access because of misuse, security concerns, violations of these terms, or changes to or closure of the beta.",
          ],
        },
        {
          title: "Disclaimers and limitations",
          body: [
            "The beta service is provided on an as-available basis. To the extent permitted by applicable law, Release Signal is not responsible for decisions made solely from unverified output or for indirect losses resulting from use of or inability to use the beta service.",
          ],
        },
        {
          title: "Contact",
          body: [
            "Questions about these terms may be sent to contact@releasesignal.io.",
          ],
        },
      ]}
    />
  );
}
