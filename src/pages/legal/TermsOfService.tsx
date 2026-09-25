import { LegalDocument } from "./LegalDocument";
import { SITE_NAME } from "../../config/site";

const LAST_UPDATED = "September 25, 2026";

export default function TermsOfService() {
  return (
    <LegalDocument
      eyebrow="Legal"
      intro={
        <p>
          These terms govern access to and use of {SITE_NAME}. By using the
          service, you agree to these terms and the Privacy Policy.
        </p>
      }
      title="Terms of Service"
      updated={LAST_UPDATED}
    >
      <section>
        <h2>The service</h2>
        <p>
          {SITE_NAME} provides Pokémon card search, third-party market data,
          collection tools, and optional automated analyses. Features and data
          coverage may change, be delayed, or become temporarily unavailable.
        </p>
      </section>

      <section>
        <h2>Accounts</h2>
        <p>
          You are responsible for providing accurate information, protecting
          your login credentials, and activity performed through your account.
          Notify support promptly if you believe your account has been
          compromised.
        </p>
      </section>

      <section>
        <h2>Subscriptions and credits</h2>
        <ul>
          <li>
            Current prices, billing intervals, included credits, and renewal
            details are shown before checkout.
          </li>
          <li>
            Paid features consume the displayed number of credits when the
            requested result is successfully delivered.
          </li>
          <li>
            Membership credits renew according to the selected plan. Bonus or
            top-up credits are governed by the terms shown at purchase.
          </li>
          <li>
            Subscriptions can be managed through the billing portal. Refunds and
            cancellation rights are honored as required by applicable law and
            the terms presented at checkout.
          </li>
        </ul>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          You may not misuse the service, bypass access or credit controls,
          automate abusive requests, interfere with other users, upload content
          you do not have the right to use, or use the service for unlawful or
          fraudulent activity.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          You retain rights to content you submit. You grant us the limited
          permission needed to transmit, process, and display that content for
          the feature you requested. Do not submit sensitive personal
          information or material that violates another person&apos;s rights.
        </p>
      </section>

      <section>
        <h2>Market data and automated analysis</h2>
        <p>
          Market prices, sales counts, grading estimates, authenticity
          assessments, and AI-generated responses are informational estimates.
          They are not professional grading, authentication, appraisal,
          financial advice, or a guarantee of a transaction outcome.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          The service may link to or rely on third-party marketplaces, payment
          providers, data providers, and AI providers. We do not control their
          availability, content, transactions, or separate terms.
        </p>
      </section>

      <section>
        <h2>Intellectual property</h2>
        <p>
          The {SITE_NAME} software, design, and original content are protected
          by applicable intellectual-property laws. Pokémon card artwork, names,
          marketplace marks, and other third-party materials remain the property
          of their respective owners.
        </p>
      </section>

      <section>
        <h2>Availability and liability</h2>
        <p>
          The service is provided on an “as available” basis. To the fullest
          extent permitted by law, we are not responsible for losses caused by
          reliance on estimated or delayed data, third-party services, or
          decisions made using automated analysis. Nothing in these terms
          excludes rights or liability that cannot legally be excluded.
        </p>
      </section>

      <section>
        <h2>Suspension and changes</h2>
        <p>
          We may restrict access to protect users, enforce these terms, comply
          with law, or preserve service stability. We may update these terms as
          the service evolves and will identify the current version by its last
          updated date.
        </p>
      </section>
    </LegalDocument>
  );
}
