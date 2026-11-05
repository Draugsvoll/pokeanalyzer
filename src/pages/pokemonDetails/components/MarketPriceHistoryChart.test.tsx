import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type {
  MarketPriceHistoryPoint,
  MarketPriceHistoryResponse,
} from "../../../services/cardApi";
import {
  MarketPriceHistoryChart,
  MarketPriceHistoryLoading,
} from "./MarketPriceHistoryChart";

beforeEach(() => vi.setSystemTime(new Date("2026-11-04T12:00:00Z")));
afterEach(() => vi.useRealTimers());

function point(
  date: string,
  avg: number,
  median7d: number | null = null,
): MarketPriceHistoryPoint {
  return {
    date,
    avg,
    median7d,
    median30d: null,
    low: null,
    high: null,
    saleCount: null,
    approxSaleCount: null,
  };
}

function history(
  series: MarketPriceHistoryResponse["series"],
): MarketPriceHistoryResponse {
  return {
    cardId: "card-1",
    condition: "NEAR_MINT",
    currency: "USD",
    fetchedAt: "2026-09-19T12:00:00.000Z",
    period: "90d",
    series,
    stale: false,
  };
}

test("renders available TCGPlayer and Ebay history together", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
        ebay: [point("2026-09-17", 490, 480), point("2026-09-18", 500, 485)],
      })}
    />,
  );

  expect(
    screen.getByRole("group", { name: "Price history sources" }),
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "Price history" })).toBeVisible();
  expect(screen.getByText("TCGPlayer")).toBeVisible();
  expect(screen.getByText("Ebay")).toBeVisible();
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "TCGPlayer and Ebay Near Mint price history from Sep 17 to Sep 18",
  );
  expect(
    document.querySelectorAll(".poketrace-market__history-line"),
  ).toHaveLength(2);
  expect(
    document.querySelectorAll(".poketrace-market__history-area"),
  ).toHaveLength(2);
  expect(
    document.querySelector(".poketrace-market__history-line--tcgplayer"),
  ).toHaveAttribute("d", expect.stringContaining("C "));
  expect(
    document.querySelector('[id^="market-history-glow-"]'),
  ).toHaveAttribute("filterUnits", "userSpaceOnUse");
});

test.each(["tcgplayer", "ebay", "graded"] as const)(
  "excludes a single 5x outlier only within the %s history",
  (source) => {
    const points = [
      { ...point(daysAgo(2), 100), saleCount: 1 },
      { ...point(daysAgo(1), 500), saleCount: 50 },
      { ...point(daysAgo(0), 90), saleCount: 2 },
    ];
    render(
      <MarketPriceHistoryChart
        history={history(
          source === "graded"
            ? { tcgplayer: [point(daysAgo(0), 1)] }
            : { [source]: points },
        )}
        gradedHistory={
          source === "graded" ? { label: "PSA 10", points } : undefined
        }
      />,
    );
    const legend = within(
      document.querySelector(
        `.poketrace-market__history-legend-item--${source}`,
      ) as HTMLElement,
    );
    expect(legend.getByText("3 sold")).toBeVisible();
    expect(screen.queryByText("$500")).not.toBeInTheDocument();
    const chart = screen.getByRole("img");
    chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
    fireEvent.pointerMove(chart, { clientX: 790 });
    expect(
      document.querySelector(
        `.poketrace-market__history-tooltip-row--${source} strong`,
      ),
    ).toHaveTextContent("$90.00");
    for (const period of ["6M", "All", "3M"]) {
      fireEvent.click(screen.getByRole("radio", { name: period }));
      expect(legend.getByText("3 sold")).toBeVisible();
    }
  },
);

test.each([
  [499, 3],
  [500, 2],
  [501, 2],
])("applies the 5x threshold to a highest price of %s", (highest, count) => {
  render(
    <MarketPriceHistoryChart
      history={history({
        ebay: [
          { ...point(daysAgo(2), 100), saleCount: 1 },
          { ...point(daysAgo(1), highest), saleCount: 1 },
          { ...point(daysAgo(0), 90), saleCount: 1 },
        ],
      })}
    />,
  );
  expect(screen.getByText(`${count} sold`)).toBeVisible();
});

test.each([[1000], [1000, 1000, 10], [1000, 0]])(
  "retains isolated prices, repeated highs, and histories without a positive comparison (%j)",
  (...prices) => {
    render(
      <MarketPriceHistoryChart
        history={history({
          ebay: prices.map((avg, index) => ({
            ...point(daysAgo(prices.length - index - 1), avg),
            saleCount: 1,
          })),
        })}
      />,
    );
    expect(screen.getByText(`${prices.length} sold`)).toBeVisible();
  },
);

test.each([
  [0, 0],
  [0.1, 0.4],
  [0.001, 0.004],
  [0.25, 0.25],
  [2, 8],
  [90, 120],
  [2000, 2175],
])(
  "renders exactly five evenly spaced horizontal grid lines for prices %s–%s",
  (low, high) => {
    render(
      <MarketPriceHistoryChart
        history={history({
          ebay: [point(daysAgo(1), low), point(daysAgo(0), high)],
        })}
      />,
    );
    const lines = [
      ...document.querySelectorAll(
        ".poketrace-market__history-grid-line:not(.poketrace-market__history-grid-line--vertical)",
      ),
    ];
    expect(lines).toHaveLength(5);
    const positions = lines.map((line) => Number(line.getAttribute("y1")));
    for (let index = 2; index < positions.length; index++) {
      expect(positions[index] - positions[index - 1]).toBeCloseTo(
        positions[1] - positions[0],
      );
    }
    const labels = lines.map(
      (line) => line.parentElement!.querySelector("text")!.textContent,
    );
    expect(new Set(labels).size).toBe(5);
    const values = labels.map((label) => Number(label!.replace(/[$,]/g, "")));
    expect(values[0]).toBeGreaterThanOrEqual(high);
    expect(values[4]).toBeLessThanOrEqual(low);
  },
);

test.each([
  [
    [0.1, 0.4],
    ["$0.50", "$0.40", "$0.30", "$0.20", "$0.10"],
  ],
  [
    [0.001, 0.004],
    ["$0.005", "$0.004", "$0.003", "$0.002", "$0.001"],
  ],
  [[0], ["$0.04", "$0.03", "$0.02", "$0.01", "$0.00"]],
  [[0.37], ["$0.41", "$0.40", "$0.39", "$0.38", "$0.37"]],
])(
  "uses fractional intervals and distinct decimal labels for %j",
  (prices, expectedLabels) => {
    render(
      <MarketPriceHistoryChart
        history={history({
          ebay: prices.map((price, index) =>
            point(daysAgo(prices.length - index - 1), price),
          ),
        })}
      />,
    );
    const labels = [
      ...document.querySelectorAll(
        ".poketrace-market__history-axis-label:not(.poketrace-market__history-date-label)",
      ),
    ].map((label) => label.textContent);
    expect(labels).toEqual(expectedLabels);
    const line = document.querySelector(".poketrace-market__history-line")!;
    expect(line.getAttribute("d")).not.toMatch(/NaN|Infinity/);
  },
);

test.each([
  [3, 45, ["$60", "$45", "$30", "$15", "$0"]],
  [0.3, 4.5, ["$6.00", "$4.50", "$3.00", "$1.50", "$0.00"]],
  [0.03, 0.45, ["$0.60", "$0.45", "$0.30", "$0.15", "$0.00"]],
] as const)(
  "allows tighter 1.5-based intervals for prices %s–%s",
  (low, high, expectedLabels) => {
    render(
      <MarketPriceHistoryChart
        history={history({
          tcgplayer: [point(daysAgo(0), low)],
          ebay: [point(daysAgo(0), high)],
        })}
      />,
    );
    const labels = [
      ...document.querySelectorAll(
        ".poketrace-market__history-axis-label:not(.poketrace-market__history-date-label)",
      ),
    ].map((label) => label.textContent);
    expect(labels).toEqual(expectedLabels);
  },
);

test("does not add price-range padding before rounding the axis", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point(daysAgo(0), 1)],
        ebay: [point(daysAgo(0), 4000)],
      })}
    />,
  );
  const labels = [
    ...document.querySelectorAll(
      ".poketrace-market__history-axis-label:not(.poketrace-market__history-date-label)",
    ),
  ].map((label) => label.textContent);
  expect(labels).toEqual(["$4,000", "$3,000", "$2,000", "$1,000", "$0"]);
});

test("compares Near Mint averages with a separately counted graded average series", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [{ ...point(daysAgo(0), 20, 15), saleCount: 8 }],
        ebay: [{ ...point(daysAgo(0), 25, 18), saleCount: 3 }],
      })}
      gradedHistory={{
        label: "PSA 10",
        points: [
          { ...point(daysAgo(120), 900, 800), saleCount: 10 },
          { ...point(daysAgo(1), 500, 450), saleCount: 2 },
          { ...point(daysAgo(0), 600), saleCount: 1 },
        ],
      }}
    />,
  );
  expect(
    document.querySelectorAll(".poketrace-market__history-line"),
  ).toHaveLength(3);
  const legend = within(
    screen.getByRole("group", { name: "Price history sources" }),
  );
  expect(legend.getByText("PSA 10")).toBeVisible();
  expect(legend.getByText("8 sold")).toBeVisible();
  const gradedLegend = within(
    document.querySelector(
      ".poketrace-market__history-legend-item--graded",
    ) as HTMLElement,
  );
  expect(gradedLegend.getByText("3 sold")).toBeVisible();
  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 46 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--graded strong",
    ),
  ).toHaveTextContent("$500");
  expect(document.querySelector("foreignObject")).toHaveAttribute(
    "height",
    "110",
  );
  fireEvent.pointerMove(chart, { clientX: 790 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--graded strong",
    ),
  ).toHaveTextContent("$600");
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--tcgplayer strong",
    ),
  ).toHaveTextContent("$20.00");
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("$25.00");
  fireEvent.click(screen.getByRole("radio", { name: "6M" }));
  expect(gradedLegend.getByText("13 sold")).toBeVisible();
});

test("applies separate update cutoffs to Near Mint and graded Ebay history", () => {
  render(
    <MarketPriceHistoryChart
      ebayUpdatedOn={daysAgo(1)}
      history={history({
        tcgplayer: [point(daysAgo(2), 20), point(daysAgo(0), 22)],
        ebay: [point(daysAgo(2), 25), point(daysAgo(0), 99)],
      })}
      gradedHistory={{
        label: "PSA 10",
        updatedOn: daysAgo(2),
        points: [point(daysAgo(2), 500, 450), point(daysAgo(1), 900, 800)],
      }}
    />,
  );
  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 46 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--graded strong",
    ),
  ).toHaveTextContent("$500");
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("$25.00");
  fireEvent.pointerMove(chart, { clientX: 790 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--graded strong",
    ),
  ).toHaveTextContent("No data");
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("No data");
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--tcgplayer strong",
    ),
  ).toHaveTextContent("$22.00");
});

test("totals sales for each selected period and animates changed legend counts", () => {
  const observations = [
    [400, 1000],
    [200, 100],
    [120, 10],
    [90, 2],
    [0, 3],
  ];
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: observations.map(([age, count]) => ({
          ...point(daysAgo(age), 100),
          saleCount: count,
        })),
        ebay: observations.map(([age, count]) => ({
          ...point(daysAgo(age), 200),
          saleCount: count * 2,
          approxSaleCount: true,
        })),
      })}
    />,
  );
  const legend = within(
    screen.getByRole("group", { name: "Price history sources" }),
  );
  const initialCount = legend.getByText("5 sold");
  expect(initialCount).toHaveClass("ui-render-fade", "ui-render-fade--counter");
  expect(legend.getByText("10 sold")).toBeVisible();
  expect(legend.queryByText(/≈/)).not.toBeInTheDocument();
  for (const [period, tcgCount, ebayCount] of [
    ["6M", "15 sold", "30 sold"],
    ["All", "1,115 sold", "2,230 sold"],
    ["3M", "5 sold", "10 sold"],
  ]) {
    fireEvent.click(screen.getByRole("radio", { name: period }));
    expect(legend.getByText(tcgCount)).toBeVisible();
    expect(legend.getByText(ebayCount)).toBeVisible();
  }
  expect(legend.getByText("5 sold")).not.toBe(initialCount);
});

test("shows unavailable for incomplete counts, preserves zero, and updates when the tier changes", () => {
  const data = history({
    tcgplayer: [
      point("2026-11-03", 100),
      { ...point("2026-11-04", 110), saleCount: 3 },
    ],
    ebay: [{ ...point("2026-11-04", 100), saleCount: 0 }],
  });
  const { rerender } = render(<MarketPriceHistoryChart history={data} />);
  const legend = within(
    screen.getByRole("group", { name: "Price history sources" }),
  );
  expect(legend.getByText("—")).toBeVisible();
  expect(legend.getByText("0 sold")).toBeVisible();
  rerender(
    <MarketPriceHistoryChart
      conditionLabel="PSA 10"
      history={history({
        ebay: [{ ...point("2026-11-04", 500), saleCount: 1 }],
      })}
    />,
  );
  expect(legend.getByText("1 sold")).toBeVisible();
  expect(legend.queryByText("TCGPlayer")).not.toBeInTheDocument();
  expect(legend.queryByText("0 sold")).not.toBeInTheDocument();
});

test("counts only points retained by the graph's date filters", () => {
  render(
    <MarketPriceHistoryChart
      ebayUpdatedOn="2026-11-03"
      history={history({
        tcgplayer: [
          { ...point("2026-11-02", 100), saleCount: 1 },
          { ...point("2026-11-04", 110), saleCount: 2 },
          { ...point("2026-11-05", 120), saleCount: 100 },
        ],
        ebay: [
          { ...point("2026-11-02", 100), saleCount: 4 },
          { ...point("2026-11-04", 110), saleCount: 6 },
          { ...point("2026-11-05", 120), saleCount: 100 },
        ],
      })}
    />,
  );
  const legend = within(
    screen.getByRole("group", { name: "Price history sources" }),
  );
  expect(legend.getByText("3 sold")).toBeVisible();
  expect(legend.getByText("4 sold")).toBeVisible();
});

test("history uses averages even when seven-day medians are available", () => {
  render(
    <MarketPriceHistoryChart
      conditionLabel="PSA 10"
      history={history({
        ebay: [point("2026-11-03", 500, 450), point("2026-11-04", 480)],
      })}
    />,
  );
  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 46 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("$500");
  fireEvent.pointerMove(chart, { clientX: 790 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("$480");
});

test("aligns mismatched dates and keeps a one-point series visible", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-16", 400)],
        ebay: [point("2026-09-17", 490, 480), point("2026-09-18", 500, 485)],
      })}
    />,
  );

  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "TCGPlayer and Ebay Near Mint price history from Sep 16 to Sep 18",
  );
  expect(
    document.querySelector(
      ".poketrace-market__history-series-marker--tcgplayer",
    ),
  ).toBeVisible();
  expect(
    document.querySelector(".poketrace-market__history-line--tcgplayer"),
  ).toHaveAttribute("d", expect.stringContaining("L 790.00"));

  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--tcgplayer strong",
    ),
  ).toHaveTextContent("$400");
});

test("renders normally when only one marketplace is available", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
      })}
    />,
  );

  expect(screen.getByText("TCGPlayer")).toBeVisible();
  expect(screen.queryByText("Ebay")).not.toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "TCGPlayer Near Mint price history from Sep 17 to Sep 18",
  );
  expect(
    document.querySelectorAll(".poketrace-market__history-line"),
  ).toHaveLength(1);
});

test("shows both marketplace values in the hover tooltip", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
        ebay: [point("2026-09-17", 490, 480), point("2026-09-18", 500, 485)],
      })}
    />,
  );

  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });

  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--tcgplayer strong",
    ),
  ).toHaveTextContent("$420");
  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("$500");
  expect(screen.getAllByText("Sep 18")).toHaveLength(2);
});

test("carries the latest Ebay price through trailing dates", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
        ebay: [point("2026-09-17", 490, 480)],
      })}
    />,
  );

  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });

  expect(screen.getByText("$420")).toBeVisible();
  expect(screen.getByText("$490")).toBeVisible();
  expect(
    document.querySelector(".poketrace-market__history-point--ebay"),
  ).toBeInTheDocument();
  expect(
    document.querySelector(".poketrace-market__history-line--ebay"),
  ).toHaveAttribute("d", expect.stringContaining("L 790.00"));
});

test("aligns the Ebay line and marker on a carried-forward date", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [
          point("2026-09-10", 33),
          point("2026-09-11", 33),
          point("2026-09-12", 33),
        ],
        ebay: [point("2026-09-10", 40, 35), point("2026-09-12", 20, 25)],
      })}
    />,
  );
  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 418 });
  expect(screen.getByText("$40.00")).toBeVisible();
  expect(
    document.querySelector(".poketrace-market__history-point--ebay"),
  ).toBeInTheDocument();

  const marker = document.querySelector(
    ".poketrace-market__history-point--ebay",
  )!;
  const coordinates = `${Number(marker.getAttribute("cx")).toFixed(2)} ${Number(marker.getAttribute("cy")).toFixed(2)}`;
  expect(
    document.querySelector(".poketrace-market__history-line--ebay"),
  ).toHaveAttribute("d", expect.stringContaining(coordinates));
});

test("stops the Ebay line at the price update date", () => {
  render(
    <MarketPriceHistoryChart
      ebayUpdatedOn="2026-09-17"
      history={history({
        tcgplayer: [point("2026-09-17", 400), point("2026-09-18", 420)],
        ebay: [point("2026-09-17", 29.04), point("2026-09-18", 55)],
      })}
    />,
  );

  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 790 });

  expect(
    document.querySelector(
      ".poketrace-market__history-tooltip-row--ebay strong",
    ),
  ).toHaveTextContent("No data");
  expect(screen.queryByText("$55.00")).not.toBeInTheDocument();
  expect(
    document.querySelector(".poketrace-market__history-line--ebay"),
  ).not.toHaveAttribute("d", expect.stringContaining("L 790.00"));
});

function daysAgo(days: number) {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return new Date(today.getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

test("limits bounded periods and shows older points only in All", () => {
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [
          point(daysAgo(400), 10000),
          point(daysAgo(250), 2500),
          point(daysAgo(120), 500),
          point(daysAgo(30), 200),
          point(daysAgo(0), 100),
        ],
      })}
    />,
  );
  const chart = screen.getByRole("img");
  const initialLabel = chart.getAttribute("aria-label");
  const initialLine = document
    .querySelector(".poketrace-market__history-line")!
    .getAttribute("d");
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  fireEvent.click(screen.getByRole("radio", { name: "6M" }));
  expect(chart.getAttribute("aria-label")).not.toBe(initialLabel);
  expect(
    document.querySelector(".poketrace-market__history-line"),
  ).not.toHaveAttribute("d", initialLine);
  const format = (date: string, includeYear = false) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: includeYear ? "numeric" : undefined,
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  expect(chart).toHaveAttribute(
    "aria-label",
    `TCGPlayer Near Mint price history from ${format(daysAgo(120))} to ${format(daysAgo(0))}`,
  );
  expect(screen.queryByText("$10,000")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "All" }));
  expect(chart).toHaveAttribute(
    "aria-label",
    `TCGPlayer Near Mint price history from ${format(daysAgo(400), true)} to ${format(daysAgo(0))}`,
  );
});

test.each([0, 60, 150, 180, 181])(
  "always offers all three periods for %s days of history",
  (age) => {
    render(
      <MarketPriceHistoryChart
        history={history({
          tcgplayer: [point(daysAgo(age), 200), point(daysAgo(0), 100)],
        })}
      />,
    );
    expect(
      screen.getAllByRole("radio").map((radio) => radio.getAttribute("value")),
    ).toEqual(["90", "180", "all"]);
    expect(screen.getByRole("radio", { name: "3M" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "6M" })).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
  },
);

test("includes previous years in axis and hover dates for All", () => {
  const firstDate = "Sep 30, 2025";
  render(
    <MarketPriceHistoryChart
      history={history({
        tcgplayer: [
          point("2025-09-30", 100),
          point("2025-11-19", 200),
          point("2026-10-05", 300),
          point("2026-11-04", 400),
        ],
      })}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "All" }));
  expect(screen.getByText(firstDate)).toBeVisible();
  expect(screen.getByText("Nov 4")).toBeVisible();
  expect(screen.queryByText("Nov 4, 2026")).not.toBeInTheDocument();
  const chart = screen.getByRole("img");
  chart.getBoundingClientRect = () => ({ left: 0, width: 800 }) as DOMRect;
  fireEvent.pointerMove(chart, { clientX: 46 });
  expect(
    document.querySelector(".poketrace-market__history-tooltip-date"),
  ).toHaveTextContent(firstDate);
});

test.each(["3M", "6M", "All"])(
  "spaces date labels evenly in %s despite uneven observation dates",
  (period) => {
    render(
      <MarketPriceHistoryChart
        history={history({
          tcgplayer: [500, 300, 200, 120, 60, 10, 2, 1, 0].map((age) =>
            point(daysAgo(age), 100 + age),
          ),
        })}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: period }));
    const labels = [
      ...document.querySelectorAll(".poketrace-market__history-date-label"),
    ];
    expect(labels).toHaveLength(7);
    const positions = labels.map((label) => Number(label.getAttribute("x")));
    const spacing = positions[1] - positions[0];
    positions.slice(1).forEach((position, index) => {
      expect(position - positions[index]).toBeCloseTo(spacing, 6);
    });
  },
);

test("shows only a subtle indicator while history loads", () => {
  render(<MarketPriceHistoryLoading />);

  const loading = screen.getByRole("status", {
    name: "Loading marketplace price history",
  });
  expect(loading).toBeVisible();
  expect(loading.querySelector(".app-loading-spinner")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
