import { LegalDocument } from "./LegalDocument";
import { SITE_NAME } from "../../config/site";

const LAST_UPDATED = "September 25, 2026";

export default function DataDisclaimer() {
  return (
    <LegalDocument
      eyebrow="Transparency"
      intro={
        <p>
          This page explains the limitations of the market data and automated
          analysis displayed by {SITE_NAME}.
        </p>
      }
      title="Data & Analysis Disclaimer"
      updated={LAST_UPDATED}
    >
      <section>
        <h2>Price data</h2>
        <p>
          Prices are supplied by third-party sources and may represent market
          prices, sold-listing aggregates, rolling statistics, or other source
          calculations. Data can be delayed, incomplete, incorrectly matched, or
          unavailable. A displayed price is not an offer to buy or sell and does
          not establish a card&apos;s actual value.
        </p>
      </section>

      <section>
        <h2>Conditions, variants, and sales</h2>
        <p>
          Results depend on the selected card identity, printing, variant, and
          condition. Marketplace terminology is not always consistent. Sales
          counts—especially from sold-listing sources—may be approximate and can
          change when listings are removed, reclassified, or corrected.
        </p>
      </section>

      <section>
        <h2>Charts and market categories</h2>
        <p>
          Charts and categories use stored observations captured at specific
          times. Missing dates may be connected visually, and different panels
          can use different source statistics. Historical performance does not
          predict future prices or liquidity.
        </p>
      </section>

      <section>
        <h2>Grading and authenticity</h2>
        <p>
          Image-based grading and authenticity results are automated estimates
          affected by lighting, image quality, hidden defects, and incomplete
          context. They do not replace physical inspection or certification by a
          qualified grading or authentication service.
        </p>
      </section>

      <section>
        <h2>No financial advice</h2>
        <p>
          Nothing on {SITE_NAME} is financial, investment, tax, or legal advice.
          Collectibles are volatile and can be difficult to sell. Independently
          verify the card, transaction, fees, source data, and counterparty
          before making a decision.
        </p>
      </section>

      <section>
        <h2>External links</h2>
        <p>
          Links to marketplaces and other services are provided for convenience.
          Their listings, prices, availability, safety, and terms are controlled
          by those third parties. Any commercial or affiliate relationship will
          be disclosed where the relevant link appears.
        </p>
      </section>
    </LegalDocument>
  );
}
