import { PRODUCT_NAME } from "@/lib/product/packageLabels";

type TrustSection = {
  title: string;
  body: string[];
};

type TrustPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: TrustSection[];
};

const trustLinks = [
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/trial-terms", label: "Trial Terms" },
  { href: "/refund-cancellation", label: "Refund / Cancellation" },
];

export default function TrustPage({
  eyebrow,
  title,
  intro,
  sections,
}: TrustPageProps) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 880,
          margin: "0 auto",
          padding: "32px 24px 72px",
        }}
      >
        <nav
          aria-label="Trust navigation"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 56,
            flexWrap: "wrap",
          }}
        >
          <a
            href="/"
            style={{
              color: "#0f172a",
              fontSize: 16,
              fontWeight: 950,
              textDecoration: "none",
            }}
          >
            {PRODUCT_NAME}
          </a>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {trustLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                style={{
                  color: "#475569",
                  fontSize: 13,
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>

        <header style={{ display: "grid", gap: 14, marginBottom: 28 }}>
          <p
            style={{
              margin: 0,
              color: "#2563eb",
              fontSize: 13,
              fontWeight: 900,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </p>
          <h1 style={{ margin: 0, fontSize: 42, lineHeight: 1.1 }}>
            {title}
          </h1>
          <p
            style={{
              margin: 0,
              color: "#475569",
              fontSize: 17,
              lineHeight: 1.7,
            }}
          >
            {intro}
          </p>
        </header>

        <div style={{ display: "grid", gap: 14 }}>
          {sections.map((section) => (
            <article
              key={section.title}
              style={{
                border: "1px solid rgba(15,23,42,0.10)",
                borderRadius: 8,
                background: "#ffffff",
                padding: 22,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 22 }}>{section.title}</h2>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {section.body.map((paragraph) => (
                  <p
                    key={paragraph}
                    style={{
                      margin: 0,
                      color: "#475569",
                      fontSize: 15,
                      lineHeight: 1.7,
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
