import { DifferentiatorSection } from "./DifferentiatorSection";
import { FaqSection } from "./FaqSection";
import { FeatureSection } from "./FeatureSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { HeroSection } from "./HeroSection";
import { ProblemSection } from "./ProblemSection";
import { PricingSection } from "./PricingSection";
import { PublicFooter } from "./PublicFooter";
import { PublicHeader } from "./PublicHeader";
import { WorkflowSection } from "./WorkflowSection";
import styles from "./MarketingShell.module.css";

export function MarketingShell() {
  return (
    <div className={styles.page}>
      <PublicHeader />
      <main>
        <HeroSection />
        <ProblemSection />
        <WorkflowSection />
        <FeatureSection />
        <DifferentiatorSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <PublicFooter />
    </div>
  );
}
