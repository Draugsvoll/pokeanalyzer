import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useScrollReveal } from "../../../hooks/useScrollReveal";
import { InfoTooltip } from "../../../components/ui/InfoTooltip";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lock,
  LockOpen,
  X,
} from "lucide-react";
import {
  adjustProbability,
  applyDisplayedProbabilities,
  probabilitiesForPricedGrades,
  DEFAULT_GRADING_FEE,
  DEFAULT_PROBABILITIES,
  DEFAULT_SHIPPING,
  GRADES,
  gradeProfit,
  moneyInputValue,
  parseMoney,
  readGradedAverage,
  readRawAverage,
  seededGradeFields,
  type Grade,
  type GradeInputs,
} from "./gradeMath";
import "./GradingCalculator.scss";

type Fields = {
  expectedPrice: string;
};

type Props = {
  currency?: string;
  hidden?: boolean;
  prices?: unknown;
};

function gradePriceSeed(prices: unknown, grade: Grade) {
  return seededGradeFields(readGradedAverage(prices, grade)).expectedPrice;
}

function rawPriceSeed(prices: unknown) {
  const price = readRawAverage(prices);
  return price == null ? "" : moneyInputValue(price);
}

export function GradingCalculator({
  currency = "USD",
  hidden = false,
  prices,
}: Props) {
  const revealRef = useScrollReveal<HTMLElement>();
  const sectionRef = useRef<HTMLElement | null>(null);
  const setSectionRef = (element: HTMLElement | null) => {
    sectionRef.current = element;
  };

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    if (hidden) {
      element.classList.remove("ui-scroll-reveal--visible");
      return;
    }
    void element.offsetWidth;
    revealRef(element);
  }, [hidden, revealRef]);
  const [probabilities, setProbabilities] = useState(DEFAULT_PROBABILITIES);
  const [lockedGrades, setLockedGrades] = useState<ReadonlySet<Grade>>(
    () => new Set(),
  );
  const [fields, setFields] = useState(
    () =>
      Object.fromEntries(
        GRADES.map((grade) => [
          grade,
          {
            expectedPrice: gradePriceSeed(prices, grade),
          },
        ]),
      ) as Record<Grade, Fields>,
  );
  const [settings, setSettings] = useState({
    gradingFee: moneyInputValue(DEFAULT_GRADING_FEE),
    shipping: moneyInputValue(DEFAULT_SHIPPING),
    sellingFee: moneyInputValue(13.25),
    sellingFeeAbove: moneyInputValue(2.35),
    sellingFeeThreshold: moneyInputValue(7500),
  });
  const gradingFee = parseMoney(settings.gradingFee);
  const shipping = parseMoney(settings.shipping);
  const sellingFeePercent = parseMoney(settings.sellingFee) ?? 0;
  const sellingFeeThreshold = parseMoney(settings.sellingFeeThreshold);
  const sellingFeeAbovePercent = parseMoney(settings.sellingFeeAbove);
  const grades = Object.fromEntries(
    GRADES.map((grade) => {
      const parsedPrice = parseMoney(fields[grade].expectedPrice);
      const expectedPrice =
        parsedPrice != null && parsedPrice > 0 ? parsedPrice : null;
      return [
        grade,
        {
          expectedPrice,
          gradingFee,
          shipping,
          ebayFees: sellingFeeAmount(
            expectedPrice,
            sellingFeePercent,
            sellingFeeThreshold,
            sellingFeeAbovePercent,
          ),
          probability: probabilities[grade],
        },
      ];
    }),
  ) as Record<Grade, GradeInputs & { probability: number }>;
  const [rawFields, setRawFields] = useState(() => ({
    price: rawPriceSeed(prices),
  }));
  const pricesRef = useRef(prices);
  useEffect(() => {
    const previousPrices = pricesRef.current;
    if (Object.is(previousPrices, prices)) return;
    pricesRef.current = prices;
    // A catalog card renders before eBay grades arrive. Fill only fields still
    // holding the previous automatic seed, so a typed or cleared price stays.
    setFields((current) => {
      let changed = false;
      const next = { ...current };
      for (const grade of GRADES) {
        if (current[grade].expectedPrice !== gradePriceSeed(previousPrices, grade)) {
          continue;
        }
        const nextValue = gradePriceSeed(prices, grade);
        if (nextValue === current[grade].expectedPrice) continue;
        next[grade] = { expectedPrice: nextValue };
        changed = true;
      }
      return changed ? next : current;
    });
    setRawFields((current) => {
      if (current.price !== rawPriceSeed(previousPrices)) return current;
      const nextValue = rawPriceSeed(prices);
      return nextValue === current.price ? current : { price: nextValue };
    });
  }, [prices]);
  const rawPrice = parseMoney(rawFields.price);
  const rawProceeds =
    rawPrice == null
      ? null
      : rawPrice -
        sellingFeeAmount(
          rawPrice,
          sellingFeePercent,
          sellingFeeThreshold,
          sellingFeeAbovePercent,
        );
  const gains = Object.fromEntries(
    GRADES.map((grade) => [grade, gradingGain(grades[grade], rawProceeds)]),
  ) as Record<Grade, number | null>;
  const pricedGrades = GRADES.filter(
    (grade) => grades[grade].expectedPrice != null,
  );
  const activeProbabilities = probabilitiesForPricedGrades(
    probabilities,
    pricedGrades,
  );
  const gradedProceeds =
    pricedGrades.length === 0
      ? null
      : pricedGrades.reduce(
          (sum, grade) =>
            sum +
            (activeProbabilities[grade] / 100) *
              (gradeProfit(grades[grade]) ?? 0),
          0,
        );
  const additionalGains =
    gradedProceeds == null ? null : gradedProceeds - (rawProceeds ?? 0);
  const gradedVsRawRoi =
    additionalGains == null || rawProceeds == null || rawProceeds <= 0
      ? null
      : (additionalGains / rawProceeds) * 100;
  const outcomeReady = pricedGrades.length >= 1;
  const chanceLocked = new Set(lockedGrades);
  GRADES.forEach((grade) => {
    if (grades[grade].expectedPrice == null) chanceLocked.add(grade);
  });
  const soleUnlockedGrade =
    pricedGrades.filter((grade) => !lockedGrades.has(grade)).length === 1
      ? pricedGrades.find((grade) => !lockedGrades.has(grade))
      : undefined;

  return (
    <section
      aria-labelledby="grading-calculator-title"
      className="grading-calculator default-container ui-render-fade ui-scroll-reveal"
      hidden={hidden}
      ref={setSectionRef}
    >
      <header className="grading-calculator__heading">
        <h3 id="grading-calculator-title">Grading calculator</h3>
      </header>

      <section aria-label="Inputs" className="grading-calculator__settings">
        <div className="grading-calculator__settings-fields">
          <div className="grading-calculator__settings-row grading-calculator__settings-row--raw">
            <div className="grading-calculator__field">
              <span>Raw price</span>
              <span
                className={`${moneyClass(rawFields.price)}${rawFields.price ? "" : " grading-calculator__money--empty"}`}
              >
                <span aria-hidden="true">{currencySymbol(currency)}</span>
                <input
                  aria-label="Raw market value"
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(event) =>
                    setRawFields((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                  value={rawFields.price}
                />
                {rawFields.price ? (
                  <ClearInputButton
                    label="Clear raw market value"
                    onClear={() =>
                      setRawFields((current) => ({ ...current, price: "" }))
                    }
                  />
                ) : null}
              </span>
            </div>
            <div className="grading-calculator__field">
              <span>Raw proceeds</span>
              <strong
                aria-label="Raw proceeds"
                className={`grading-calculator__settings-proceeds ${toneClass(rawProceeds)}`.trim()}
              >
                <Price>{formatMoney(rawProceeds, currency)}</Price>
              </strong>
            </div>
          </div>
          <div className="grading-calculator__settings-row">
            <div className="grading-calculator__field">
              <span className="grading-calculator__field-label">
                PSA grading fee
                <FieldLink
                  href="https://www.psacard.com/services/tradingcardgrading"
                  label="PSA grading tiers"
                />
              </span>
              <span className={moneyClass(settings.gradingFee)}>
                <span aria-hidden="true">{currencySymbol(currency)}</span>
                <input
                  aria-label="PSA grading fee"
                  inputMode="decimal"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      gradingFee: event.target.value,
                    }))
                  }
                  value={settings.gradingFee}
                />
                {settings.gradingFee ? (
                  <ClearInputButton
                    label="Clear PSA grading fee"
                    onClear={() =>
                      setSettings((current) => ({ ...current, gradingFee: "" }))
                    }
                  />
                ) : null}
              </span>
            </div>
            <div className="grading-calculator__field">
              <span>Shipping & insurance</span>
              <span className={moneyClass(settings.shipping)}>
                <span aria-hidden="true">{currencySymbol(currency)}</span>
                <input
                  aria-label="Shipping & insurance"
                  inputMode="decimal"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      shipping: event.target.value,
                    }))
                  }
                  value={settings.shipping}
                />
                {settings.shipping ? (
                  <ClearInputButton
                    label="Clear shipping and insurance"
                    onClear={() =>
                      setSettings((current) => ({ ...current, shipping: "" }))
                    }
                  />
                ) : null}
              </span>
            </div>
            <div className="grading-calculator__field">
              <span className="grading-calculator__field-label">
                Ebay selling fee
                <FieldLink
                  href="https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822"
                  label="Ebay selling fees"
                />
              </span>
              <span className={moneyClass(settings.sellingFee, true)}>
                <span aria-hidden="true">%</span>
                <input
                  aria-label="Ebay selling fee"
                  inputMode="decimal"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      sellingFee: event.target.value,
                    }))
                  }
                  value={settings.sellingFee}
                />
                <NumberStepper
                  label="Ebay selling fee"
                  onStep={(direction) =>
                    setSettings((current) => ({
                      ...current,
                      sellingFee: changeNumber(current.sellingFee, direction),
                    }))
                  }
                />
              </span>
            </div>
            <div className="grading-calculator__field">
              <span className="grading-calculator__field-label">
                Ebay portional selling fee
                <InfoTooltip label="Portional fee">
                  <strong>Ebay portional selling fee</strong>
                  <span>
                    Different fee applied to the portion of a price above a
                    treshold.
                  </span>
                </InfoTooltip>
              </span>
              <span className="grading-calculator__fee-split">
                <span className={moneyClass(settings.sellingFeeThreshold)}>
                  <span aria-hidden="true">{currencySymbol(currency)}</span>
                  <input
                    aria-label="Selling fee price threshold"
                    inputMode="decimal"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        sellingFeeThreshold: event.target.value,
                      }))
                    }
                    value={settings.sellingFeeThreshold}
                  />
                  {settings.sellingFeeThreshold ? (
                    <ClearInputButton
                      label="Clear portional fee threshold"
                      onClear={() =>
                        setSettings((current) => ({
                          ...current,
                          sellingFeeThreshold: "",
                        }))
                      }
                    />
                  ) : null}
                </span>
                <span className={moneyClass(settings.sellingFeeAbove, true)}>
                  <span aria-hidden="true">%</span>
                  <input
                    aria-label="Selling fee above percent"
                    inputMode="decimal"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        sellingFeeAbove: event.target.value,
                      }))
                    }
                    value={settings.sellingFeeAbove}
                  />
                  <NumberStepper
                    label="selling fee above percent"
                    onStep={(direction) =>
                      setSettings((current) => ({
                        ...current,
                        sellingFeeAbove: changeNumber(
                          current.sellingFeeAbove,
                          direction,
                        ),
                      }))
                    }
                  />
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <article
        className={
          outcomeReady
            ? "grading-calculator__summary"
            : "grading-calculator__summary grading-calculator__summary--disabled"
        }
      >
        <div className="grading-calculator__summary-heading">
          <h3>Outcomes</h3>
          <p>Insert price estimates. Calculations appear below.</p>
        </div>
        <article className="grading-calculator__outcome-card grading-calculator__outcome-card--spread">
          <div className="grading-calculator__compare-gain">
            <h4>Expected incremental gain</h4>
            <strong
              aria-label="Grade & sell vs. selling raw"
              className={
                additionalGains == null
                  ? "grading-calculator__summary-empty"
                  : toneClass(additionalGains)
              }
            >
              <Price>{formatSignedMoney(additionalGains, currency)}</Price>
            </strong>
            <span
              aria-label="Grade & sell vs. selling raw ROI"
              className={`grading-calculator__compare-roi ${toneClass(gradedVsRawRoi)}`.trim()}
            >
              {gradedVsRawRoi == null
                ? "—"
                : formatSignedPercent(gradedVsRawRoi)}
            </span>
            <span>
              Compared with selling raw
              <InfoTooltip label="Graded vs Raw">
                <strong>Compared with selling raw</strong>
                <span>
                  The additional gain or loss from grading and selling the card,
                  rather than selling it raw, after all applicable costs and
                  fees. Expressed in dollars and as a percentage of raw net
                  proceeds.
                </span>
              </InfoTooltip>
            </span>
          </div>
          <div className="grading-calculator__outcome-grid">
            {GRADES.map((grade) => {
              const gain = gains[grade];
              const priced = grades[grade].expectedPrice != null;
              const chanceDisabled = !priced;
              const chanceFixed =
                chanceDisabled ||
                lockedGrades.has(grade) ||
                grade === soleUnlockedGrade;
              const shownChance = activeProbabilities[grade];
              return (
                <article
                  className="grading-calculator__outcome-card"
                  key={grade}
                >
                  <h4>PSA {grade}</h4>
                  <div className="grading-calculator__field">
                    <span className={moneyClass(fields[grade].expectedPrice)}>
                      <span aria-hidden="true">{currencySymbol(currency)}</span>
                      <input
                        aria-label={`PSA ${grade} Sell price`}
                        inputMode="decimal"
                        placeholder="0"
                        onChange={(event) =>
                          setFields((current) => ({
                            ...current,
                            [grade]: { expectedPrice: event.target.value },
                          }))
                        }
                        onFocus={() => {
                          if (fields[grade].expectedPrice !== "0") return;
                          setFields((current) => ({
                            ...current,
                            [grade]: { expectedPrice: "" },
                          }));
                        }}
                        value={fields[grade].expectedPrice}
                      />
                      {fields[grade].expectedPrice ? (
                        <ClearInputButton
                          label={`Clear PSA ${grade} sell price`}
                          onClear={() =>
                            setFields((current) => ({
                              ...current,
                              [grade]: { expectedPrice: "" },
                            }))
                          }
                        />
                      ) : null}
                    </span>
                  </div>
                  <div className="grading-calculator__outcome-result default-container-inner">
                    <strong
                      aria-label={`PSA ${grade} expected value`}
                      className={`grading-calculator__outcome-profit ${
                        gain == null
                          ? "grading-calculator__summary-empty"
                          : toneClass(gain)
                      }`.trim()}
                    >
                      <Price>{formatSignedMoney(gain, currency)}</Price>
                    </strong>
                  </div>
                  <div
                    className={
                      chanceDisabled
                        ? "grading-calculator__chance grading-calculator__chance--empty"
                        : "grading-calculator__chance"
                    }
                  >
                    <div className="grading-calculator__chance-label">
                      <span>Probability</span>
                      <span className="grading-calculator__chance-value">
                        <button
                          aria-label={
                            lockedGrades.has(grade)
                              ? `Unlock PSA ${grade} chance`
                              : `Lock PSA ${grade} chance`
                          }
                          aria-pressed={lockedGrades.has(grade)}
                          disabled={chanceDisabled}
                          onClick={() =>
                            setLockedGrades((current) => {
                              const next = new Set(current);
                              if (next.has(grade)) next.delete(grade);
                              else next.add(grade);
                              return next;
                            })
                          }
                          type="button"
                        >
                          {lockedGrades.has(grade) ? (
                            <Lock aria-hidden="true" size={14} />
                          ) : (
                            <LockOpen aria-hidden="true" size={14} />
                          )}
                        </button>
                        <strong>{shownChance}%</strong>
                      </span>
                    </div>
                    <input
                      aria-disabled={chanceFixed}
                      aria-label={`PSA ${grade} chance`}
                      aria-valuetext={`${shownChance} percent`}
                      className={
                        chanceFixed
                          ? "grading-calculator__chance-input--locked"
                          : undefined
                      }
                      disabled={chanceDisabled}
                      max={100}
                      min={0}
                      onChange={(event) => {
                        if (chanceFixed) return;
                        setProbabilities((current) =>
                          applyDisplayedProbabilities(
                            current,
                            adjustProbability(
                              activeProbabilities,
                              grade,
                              Number(event.target.value),
                              chanceLocked,
                            ),
                            pricedGrades,
                          ),
                        );
                      }}
                      onKeyDown={(event) => {
                        if (chanceFixed) event.preventDefault();
                      }}
                      step={1}
                      style={
                        {
                          "--chance-fill": `${shownChance}%`,
                        } as CSSProperties
                      }
                      type="range"
                      value={shownChance}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </article>
        {GRADES.some((grade) => grades[grade].expectedPrice != null) && (
          <>
            <h3>Calculations</h3>
            <div className="grading-calculator__grades">
              {GRADES.map((grade) => {
                const expectedPrice = grades[grade].expectedPrice;
                if (expectedPrice == null) return null;
                const priced = true;
                const sellingFees = sellingFeeAmount(
                  expectedPrice,
                  sellingFeePercent,
                  sellingFeeThreshold,
                  sellingFeeAbovePercent,
                );
                const gain = gains[grade];
                const priceMultiple = formatMultiple(rawPrice, expectedPrice);
                const gradedBelowRaw =
                  expectedPrice != null &&
                  rawPrice != null &&
                  expectedPrice < rawPrice;
                return (
                  <article
                    className={
                      priced
                        ? "grading-calculator__grade ui-render-fade"
                        : "grading-calculator__grade grading-calculator__grade--empty ui-render-fade"
                    }
                    key={grade}
                  >
                    <header className="default-container-inner">
                      <h3>PSA {grade}</h3>
                      <p className="grading-calculator__transform">
                        <span className="grading-calculator__transform-side">
                          <span className="grading-calculator__transform-amount">
                            <Price>{formatMoney(rawPrice, currency)}</Price>
                          </span>
                          <span className="grading-calculator__transform-label">
                            Raw price
                          </span>
                        </span>
                        <span className="grading-calculator__transform-mid">
                          <span
                            aria-hidden="true"
                            className="grading-calculator__transform-arrow"
                          >
                            →
                          </span>
                          {priceMultiple != null && (
                            <span
                              className={`grading-calculator__transform-multiple ${
                                gradedBelowRaw
                                  ? "grading-calculator__value--down"
                                  : "grading-calculator__value--up"
                              }`}
                            >
                              {priceMultiple}
                            </span>
                          )}
                        </span>
                        <span className="grading-calculator__transform-side">
                          <span
                            className={`grading-calculator__transform-amount ${
                              priced
                                ? gradedBelowRaw
                                  ? "grading-calculator__value--down"
                                  : "grading-calculator__value--up"
                                : ""
                            }`.trim()}
                          >
                            {priced && (
                              <Price>
                                {formatMoney(
                                  grades[grade].expectedPrice,
                                  currency,
                                )}
                              </Price>
                            )}
                          </span>
                          <span className="grading-calculator__transform-label">
                            Graded price
                          </span>
                        </span>
                      </p>
                    </header>
                    <div className="grading-calculator__breakdown">
                      <div className="grading-calculator__fields">
                        <div className="grading-calculator__field">
                          <span className="grading-calculator__sell-label">
                            Sell price
                          </span>
                          <span
                            className={moneyClass(fields[grade].expectedPrice)}
                          >
                            <span aria-hidden="true">
                              {currencySymbol(currency)}
                            </span>
                            <input
                              aria-label={`PSA ${grade} Sell price`}
                              inputMode="decimal"
                              placeholder="0"
                              onChange={(event) =>
                                setFields((current) => ({
                                  ...current,
                                  [grade]: {
                                    expectedPrice: event.target.value,
                                  },
                                }))
                              }
                              onFocus={() => {
                                if (fields[grade].expectedPrice !== "0") return;
                                setFields((current) => ({
                                  ...current,
                                  [grade]: { expectedPrice: "" },
                                }));
                              }}
                              value={fields[grade].expectedPrice}
                            />
                            {fields[grade].expectedPrice ? (
                              <ClearInputButton
                                label={`Clear PSA ${grade} sell price`}
                                onClear={() =>
                                  setFields((current) => ({
                                    ...current,
                                    [grade]: { expectedPrice: "" },
                                  }))
                                }
                              />
                            ) : null}
                          </span>
                        </div>
                      </div>
                      <div className="grading-calculator__ledger">
                        <div className="grading-calculator__ledger-row">
                          <span>PSA grading fee</span>
                          <strong
                            className={
                              priced
                                ? "grading-calculator__deduction"
                                : undefined
                            }
                          >
                            <Price>
                              {priced
                                ? formatDeduction(gradingFee ?? 0, currency)
                                : "—"}
                            </Price>
                          </strong>
                        </div>
                        <div className="grading-calculator__ledger-row">
                          <span>Shipping & insurance</span>
                          <strong
                            className={
                              priced
                                ? "grading-calculator__deduction"
                                : undefined
                            }
                          >
                            <Price>
                              {priced
                                ? formatDeduction(shipping ?? 0, currency)
                                : "—"}
                            </Price>
                          </strong>
                        </div>
                        <div className="grading-calculator__ledger-row">
                          <span>
                            Selling fees
                            <span className="grading-calculator__ledger-note">
                              {sellingFeeLabel(
                                sellingFeePercent,
                                sellingFeeThreshold,
                                sellingFeeAbovePercent,
                                grades[grade].expectedPrice,
                                currency,
                              )}
                            </span>
                          </span>
                          <strong
                            className={
                              priced
                                ? "grading-calculator__deduction"
                                : undefined
                            }
                          >
                            <Price>
                              {priced
                                ? formatDeduction(sellingFees, currency)
                                : "—"}
                            </Price>
                          </strong>
                        </div>
                        <div className="grading-calculator__ledger-row">
                          <span>
                            Raw proceeds
                            <span className="grading-calculator__ledger-note">
                              Opportunity cost
                            </span>
                          </span>
                          <strong
                            className={
                              priced
                                ? "grading-calculator__deduction"
                                : undefined
                            }
                          >
                            <Price>
                              {priced
                                ? formatDeduction(rawProceeds ?? 0, currency)
                                : "—"}
                            </Price>
                          </strong>
                        </div>
                        <div className="grading-calculator__ledger-row grading-calculator__ledger-row--total">
                          <span>Additional gain from grading.</span>
                          <strong
                            aria-label={`PSA ${grade} profit`}
                            className={toneClass(gain)}
                          >
                            <Price>{formatSignedMoney(gain, currency)}</Price>
                          </strong>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </article>
    </section>
  );
}

function Price({ children }: { children: string }) {
  return (
    <span className="grading-calculator__price ui-render-fade" key={children}>
      {children}
    </span>
  );
}

function FieldLink({ href, label }: { href: string; label: string }) {
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);

  function show(x: number, y: number) {
    const width = Math.min(href.length * 6.6 + 18, window.innerWidth - 16);
    setTip({
      left: Math.max(8, Math.min(x + 14, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y + 18, window.innerHeight - 32)),
    });
  }

  return (
    <>
      <a
        aria-label={label}
        className="grading-calculator__field-link"
        href={href}
        onBlur={() => setTip(null)}
        onFocus={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          show(rect.left, rect.bottom);
        }}
        onMouseEnter={(event) => show(event.clientX, event.clientY)}
        onMouseLeave={() => setTip(null)}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink aria-hidden="true" size={14} />
      </a>
      {tip &&
        createPortal(
          <span
            className="grading-calculator__native-tip"
            role="tooltip"
            style={{ left: tip.left, top: tip.top }}
          >
            {href}
          </span>,
          document.body,
        )}
    </>
  );
}

function moneyClass(value: string, percent = false) {
  return [
    "grading-calculator__money",
    percent ? "grading-calculator__money--percent" : "",
    !percent && value ? "grading-calculator__money--clearable" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function ClearInputButton({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grading-calculator__clear"
      onClick={onClear}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      <X aria-hidden="true" />
    </button>
  );
}

function NumberStepper({
  label,
  onStep,
}: {
  label: string;
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <span className="grading-calculator__stepper">
      <button
        aria-label={`Increase ${label}`}
        onClick={() => onStep(1)}
        type="button"
      >
        <ChevronUp aria-hidden="true" size={12} />
      </button>
      <button
        aria-label={`Decrease ${label}`}
        onClick={() => onStep(-1)}
        type="button"
      >
        <ChevronDown aria-hidden="true" size={12} />
      </button>
    </span>
  );
}

function changeNumber(value: string, delta: number) {
  const current = parseMoney(value) ?? 0;
  const next = Math.max(0, Math.round((current + delta) * 100) / 100);
  return String(next);
}

function currencySymbol(currency: string) {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return currency;
}

function formatFeePercent(value: number) {
  return `${Number(value.toFixed(2))}%`;
}

function sellingFeeLabel(
  percent: number,
  threshold: number | null,
  abovePercent: number | null,
  price: number | null,
  currency: string,
) {
  const base = formatFeePercent(percent);
  if (
    price == null ||
    threshold == null ||
    threshold <= 0 ||
    abovePercent == null ||
    price <= threshold
  ) {
    return base;
  }
  const limit = Number.isInteger(threshold)
    ? String(threshold)
    : String(Number(threshold.toFixed(2)));
  return `${base} + ${formatFeePercent(abovePercent)} above ${currencySymbol(currency)}${limit}`;
}

function formatMultiple(raw: number | null, graded: number | null) {
  if (raw == null || graded == null || raw <= 0) return null;
  const rawPrice = raw;
  const gradedPrice = graded;
  const multiple = gradedPrice / rawPrice;
  const rounded = Number(multiple.toFixed(1));
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}×`;
}

function gradingGain(inputs: GradeInputs, rawProceeds: number | null) {
  const profit = gradeProfit(inputs);
  if (profit == null) return null;
  return profit - (rawProceeds ?? 0);
}

function formatDeduction(value: number, currency: string) {
  return `−${formatMoney(Math.abs(value), currency)}`;
}

function sellingFeeAmount(
  price: number | null,
  percent: number,
  threshold: number | null,
  abovePercent: number | null,
) {
  if (price == null) return 0;
  if (
    threshold == null ||
    threshold <= 0 ||
    abovePercent == null ||
    price <= threshold
  ) {
    return price * (percent / 100);
  }
  return (
    threshold * (percent / 100) + (price - threshold) * (abovePercent / 100)
  );
}

function toneClass(value: number | null) {
  if (value == null || value === 0) return "";
  return value > 0
    ? "grading-calculator__value--up"
    : "grading-calculator__value--down";
}

function formatMoney(value: number | null, currency: string) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

function formatSignedPercent(value: number | null) {
  if (value == null) return "—";
  const amount = `${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
  if (value > 0) return `+${amount}`;
  if (value < 0) return `−${amount}`;
  return amount;
}

function formatSignedMoney(value: number | null, currency: string) {
  if (value == null) return "—";
  const amount = formatMoney(Math.abs(value), currency);
  if (value > 0) return `+${amount}`;
  if (value < 0) return `−${amount}`;
  return amount;
}
