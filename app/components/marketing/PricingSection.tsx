import {
  betaTrialHref,
  pricingOptions,
  primaryCtaLabel,
} from "./marketingContent";
import styles from "./MarketingShell.module.css";

export function PricingSection() {
  return (
    <section
      className={`${styles.section} ${styles.bandSection}`}
      id="pricing"
    >
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>Pricing</p>
          <h2 className={styles.sectionTitle}>Beta access now. Standard later.</h2>
          <p className={styles.sectionCopy}>
            Join the current non-paying beta, or review the planned Standard
            pricing for the future paid service.
          </p>
        </div>

        <div className={styles.pricingGrid}>
          <article className={styles.pricingCard}>
            <p className={styles.pricingStatus}>{pricingOptions.beta.status}</p>
            <h3 className={styles.pricingTitle}>{pricingOptions.beta.name}</h3>
            <p className={styles.pricingPrice}>{pricingOptions.beta.price}</p>
            <ul className={styles.pricingDetails}>
              {pricingOptions.beta.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
            <a className={styles.buttonDark} href={betaTrialHref}>
              {primaryCtaLabel}
            </a>
          </article>

          <article className={styles.pricingCard}>
            <p className={styles.pricingStatus}>
              {pricingOptions.standard.status}
            </p>
            <h3 className={styles.pricingTitle}>
              {pricingOptions.standard.name}
            </h3>
            <p className={styles.pricingPrice}>
              {pricingOptions.standard.price}
            </p>
            <p className={styles.pricingNote}>
              {pricingOptions.standard.description}
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
