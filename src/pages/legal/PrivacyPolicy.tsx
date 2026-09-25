import { LegalDocument } from "./LegalDocument";
import { SITE_NAME } from "../../config/site";

const LAST_UPDATED = "September 25, 2026";

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      eyebrow="Legal"
      intro={
        <p>
          This policy explains what information {SITE_NAME} processes, why it is
          processed, and the choices available to you when using the service.
        </p>
      }
      title="Privacy Policy"
      updated={LAST_UPDATED}
    >
      <section>
        <h2>Information we process</h2>
        <ul>
          <li>
            Account information such as your name, email address, verification
            status, and account identifier.
          </li>
          <li>
            Collection information you choose to save, including card IDs and
            quantities.
          </li>
          <li>
            Subscription, credit-balance, and payment-status information. Full
            payment-card details are handled by Stripe and are not stored by
            {` ${SITE_NAME}`}.
          </li>
          <li>
            Requests and images you voluntarily submit to analysis features,
            together with the resulting analysis.
          </li>
          <li>
            Basic technical information needed to secure, operate, and debug the
            service, such as request timing, error details, and IP-derived
            security signals.
          </li>
        </ul>
      </section>

      <section>
        <h2>How information is used</h2>
        <p>
          We use information to provide accounts and portfolios, deliver paid
          features, prevent abuse, process payments, maintain the service,
          answer support requests, and comply with legal obligations. We do not
          sell your personal information.
        </p>
      </section>

      <section>
        <h2>Service providers</h2>
        <p>
          The service relies on providers including Firebase for authentication
          and account storage, Stripe for payments, Railway for hosting, Turso
          for application data, and AI providers for features you explicitly
          request. Each provider processes data under its own terms and privacy
          commitments.
        </p>
      </section>

      <section>
        <h2>Browser storage</h2>
        <p>
          {SITE_NAME} uses local browser storage and IndexedDB to retain public
          card catalogues, market categories, session information, and other
          data that improves speed and continuity. Clearing site data in your
          browser removes these local copies.
        </p>
      </section>

      <section>
        <h2>Retention and security</h2>
        <p>
          Information is retained only as long as reasonably needed to provide
          the service, maintain legitimate business records, resolve disputes,
          prevent fraud, and meet legal obligations. We use access controls and
          technical safeguards, but no online service can promise absolute
          security.
        </p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <p>
          Depending on where you live, you may ask to access, correct, export,
          or delete personal information, or object to certain processing. We
          may need to verify your identity and may retain records where the law
          requires or permits it. Contact support to submit a request.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          The service is not directed to children under 13. Users who are not
          old enough to enter a binding agreement in their location should use
          the service only with permission and supervision from a parent or
          guardian.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as the service changes. The date at the top
          identifies the latest version, and material changes will be
          communicated where appropriate.
        </p>
      </section>
    </LegalDocument>
  );
}
