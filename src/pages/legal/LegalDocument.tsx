import { useLayoutEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  SITE_NAME,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_LINK,
} from "../../config/site";
import "./LegalDocument.scss";

type LegalDocumentProps = {
  children: ReactNode;
  eyebrow: string;
  intro: ReactNode;
  title: string;
  updated: string;
};

export function LegalDocument({
  children,
  eyebrow,
  intro,
  title,
  updated,
}: LegalDocumentProps) {
  useLayoutEffect(() => {
    window.scrollTo({ behavior: "instant", left: 0, top: 0 });
  }, []);

  return (
    <article className="legal-document default-container">
      <header className="legal-document__header">
        <span className="app-subheader">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="legal-document__updated">Last updated {updated}</p>
        <div className="legal-document__intro">{intro}</div>
      </header>

      <div className="legal-document__body">{children}</div>

      <footer className="legal-document__contact">
        <h2>Questions</h2>
        <p>
          Questions about this document can be sent to{" "}
          <a href={SUPPORT_EMAIL_LINK}>{SUPPORT_EMAIL}</a>.
        </p>
        <p>
          Return to the <Link to="/">{SITE_NAME} homepage</Link>.
        </p>
      </footer>
    </article>
  );
}
