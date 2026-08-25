import {
  betaTrialHref,
  contactEmail,
  primaryCtaLabel,
} from "./marketingContent";
import styles from "./MarketingShell.module.css";

export function FinalCtaSection() {
  return (
    <section className={`${styles.section} ${styles.finalCta}`}>
      <div className={`${styles.container} ${styles.finalCtaGrid}`}>
        <div>
          <p className={styles.eyebrow}>Controlled beta access</p>
          <h2 className={styles.sectionTitle}>
            Start with one requirement. See how strong your release evidence
            really is.
          </h2>
          <p className={styles.contactLine}>
            For support or questions, contact{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
        </div>

        <div className={styles.actionRow}>
          <a className={styles.buttonPrimary} href={betaTrialHref}>
            {primaryCtaLabel}
          </a>
          <a className={styles.buttonSecondary} href="#how-it-works">
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}
