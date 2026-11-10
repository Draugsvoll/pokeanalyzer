import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { GradingCalculator } from "./GradingCalculator";

test("numeric fields accept decimals and reject nonnumeric values", () => {
  render(<GradingCalculator />);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Ebay portional selling fee" }),
  );
  expect(
    screen.queryByRole("button", { name: "Clear portional fee threshold" }),
  ).not.toBeInTheDocument();
  for (const input of screen.getAllByRole("spinbutton")) {
    fireEvent.change(input, { target: { value: "12.5" } });
    expect(input).toHaveValue(12.5);
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input).toHaveValue(null);
  }
});

test.each([7, 8, 9, 10])(
  "shows the estimate prompt in the comparison label only while all PSA inputs are empty (PSA %s)",
  (grade) => {
    const { container } = render(<GradingCalculator />);
    const prompt = "Insert price estimates. See calculations below.";
    const comparison = container.querySelector(
      ".grading-calculator__compare-gain",
    )!;
    expect(comparison).toHaveTextContent(prompt);
    expect(
      container.querySelector(".grading-calculator__summary-heading"),
    ).not.toHaveTextContent(prompt);
    expect(comparison).not.toHaveTextContent("Compared with selling raw");
    const input = screen.getAllByLabelText(`PSA ${grade} Sell price`)[0];
    fireEvent.change(input, { target: { value: "100" } });
    expect(comparison).toHaveTextContent("Compared with selling raw");
    expect(screen.queryByText(prompt)).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "" } });
    expect(comparison).toHaveTextContent(prompt);
    expect(comparison).not.toHaveTextContent("Compared with selling raw");
  },
);

test("keeps each grade's costs separate and updates the weighted outcome", () => {
  render(<GradingCalculator />);

  expect(screen.getByLabelText("PSA grading fee")).toHaveValue(59);
  expect(screen.getByLabelText("Shipping & insurance")).toHaveValue(35);
  expect(screen.getByLabelText("Ebay selling fee")).toHaveValue(13.25);
  expect(screen.getByLabelText("Selling fee price threshold")).toHaveValue(
    7500,
  );
  expect(screen.getByLabelText("Selling fee above percent")).toHaveValue(2.35);
  fireEvent.mouseEnter(
    screen.getByRole("link", { name: "PSA grading tiers" }),
    {
      clientX: 40,
      clientY: 40,
    },
  );
  expect(
    screen.getByRole("tooltip", {
      name: "https://www.psacard.com/services/tradingcardgrading",
    }),
  ).toBeInTheDocument();
  fireEvent.mouseLeave(screen.getByRole("link", { name: "PSA grading tiers" }));
  fireEvent.mouseEnter(
    screen.getByRole("link", { name: "Ebay selling fees" }),
    {
      clientX: 40,
      clientY: 40,
    },
  );
  expect(
    screen.getByRole("tooltip", {
      name: "https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822",
    }),
  ).toBeInTheDocument();

  fireEvent.change(screen.getAllByLabelText("PSA 10 Sell price")[0], {
    target: { value: "1000" },
  });

  const card = gradeArticle("PSA 10");
  expect(card).toHaveTextContent("Raw");
  expect(card).toHaveTextContent("Graded");
  expect(card).toHaveTextContent("$1,000.00");
  expect(card).not.toHaveTextContent("Chance of PSA 10");
  fireEvent.change(screen.getByLabelText("Raw market value"), {
    target: { value: "100" },
  });
  expect(screen.getByLabelText("Raw proceeds")).toHaveTextContent("$86.75");

  const profit = screen.getByLabelText("PSA 10 profit");
  expect(profit).toHaveTextContent("+$686.75");
  expect(card).toHaveTextContent("−$59.00");
  expect(card).toHaveTextContent("−$35.00");
  expect(card).toHaveTextContent("−$86.75");
  expect(card).toHaveTextContent("Raw proceeds");
  expect(card).toHaveTextContent("Additional gain from grading.");
  expect(card).not.toHaveTextContent("Sell raw vs. sell graded");
  expect(card).toHaveTextContent("10×");

  expect(card).not.toHaveTextContent("+$886.00 net proceeds");
  expect(
    screen.queryByLabelText("Net gain from grading"),
  ).not.toBeInTheDocument();
  expect(gradeArticle("PSA 10")).not.toHaveClass(
    "grading-calculator__grade--empty",
  );
  expect(
    screen.queryByRole("heading", { name: "PSA 9", level: 3 }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByLabelText("PSA 9 Sell price")[0]).toHaveValue(null);
  expect(screen.queryByLabelText("graded proceeds")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/instead of selling raw today/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByLabelText("Grade & sell vs. selling raw"),
  ).toHaveTextContent("+$686.75");
  expect(
    screen.getByLabelText("Grade & sell vs. selling raw ROI"),
  ).toHaveTextContent("+791.6%");
  expect(screen.getByLabelText("PSA 10 chance")).toHaveValue("100");

  fireEvent.change(screen.getByLabelText("PSA 10 chance"), {
    target: { value: "40" },
  });

  expect(screen.getByLabelText("PSA 10 chance")).toHaveValue("100");
  expect(screen.getByLabelText("PSA 9 chance")).toHaveValue("0");

  fireEvent.change(screen.getAllByLabelText("PSA 9 Sell price")[0], {
    target: { value: "100" },
  });
  expect(screen.getByLabelText("PSA 10 chance")).toHaveValue("30");
  expect(screen.getByLabelText("PSA 9 chance")).toHaveValue("70");
  fireEvent.change(screen.getByLabelText("PSA 10 chance"), {
    target: { value: "40" },
  });
  expect(screen.getByLabelText("PSA 10 chance")).toHaveValue("40");
  expect(screen.getByLabelText("PSA 9 chance")).toHaveValue("60");
  fireEvent.click(screen.getByRole("button", { name: "Lock PSA 9 chance" }));
  const lockedValue = (
    screen.getByLabelText("PSA 9 chance") as HTMLInputElement
  ).value;
  expect(screen.getByLabelText("PSA 9 chance")).toHaveAttribute("max", "100");
  fireEvent.change(screen.getByLabelText("PSA 9 chance"), {
    target: { value: "80" },
  });
  expect(screen.getByLabelText("PSA 9 chance")).toHaveValue(lockedValue);
  fireEvent.change(screen.getByLabelText("PSA 10 chance"), {
    target: { value: "20" },
  });
  expect(screen.getByLabelText("PSA 9 chance")).toHaveValue(lockedValue);
  expect(screen.getByLabelText("PSA 10 chance")).toHaveValue("40");
  expect(screen.getByLabelText("PSA 10 chance")).toHaveAttribute("max", "100");

  fireEvent.change(screen.getAllByLabelText("PSA 10 Sell price")[0], {
    target: { value: "10000" },
  });
  const portionalFee = screen.getByRole("checkbox", {
    name: "Ebay portional selling fee",
  });
  expect(portionalFee).not.toBeChecked();
  expect(screen.getByLabelText("Selling fee price threshold")).toBeDisabled();
  expect(screen.getByLabelText("Selling fee above percent")).toBeDisabled();
  expect(gradeArticle("PSA 10")).not.toHaveTextContent("above $7500");
  const profitWithoutPortionalFee =
    screen.getByLabelText("PSA 10 profit").textContent;
  fireEvent.click(portionalFee);
  expect(screen.getByLabelText("Selling fee price threshold")).toBeEnabled();
  expect(screen.getByLabelText("Selling fee above percent")).toBeEnabled();
  expect(screen.getByLabelText("PSA 10 profit")).toHaveTextContent(
    "+$8,766.75",
  );
  expect(gradeArticle("PSA 10")).toHaveTextContent(
    "13.25% up to $7500 and 2.35% above",
  );
  expect(
    screen.queryByLabelText("Additional sales tax"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Raw proceeds")).toHaveTextContent("$86.75");
  fireEvent.click(portionalFee);
  expect(screen.getByLabelText("PSA 10 profit")).toHaveTextContent(
    profitWithoutPortionalFee!,
  );
});

test("keeps an empty grade's chance after another slider moves", () => {
  render(<GradingCalculator />);

  fireEvent.change(screen.getAllByLabelText("PSA 10 Sell price")[0], {
    target: { value: "1000" },
  });
  fireEvent.change(screen.getAllByLabelText("PSA 9 Sell price")[0], {
    target: { value: "100" },
  });
  fireEvent.change(screen.getByLabelText("PSA 10 chance"), {
    target: { value: "40" },
  });
  expect(screen.getByLabelText("PSA 8 chance")).toHaveValue("0");

  fireEvent.change(screen.getAllByLabelText("PSA 8 Sell price")[0], {
    target: { value: "100" },
  });

  expect(screen.getByLabelText("PSA 8 chance")).toHaveValue("41");
  expect(screen.getByLabelText("PSA 10 chance")).toHaveValue("24");
  expect(screen.getByLabelText("PSA 9 chance")).toHaveValue("35");
  expect(screen.getByLabelText("PSA 7 chance")).toHaveValue("0");
});

test("fills each grade when prices arrive, and keeps an edited price", () => {
  const { rerender } = render(
    <GradingCalculator prices={{ tcgplayer: { NEAR_MINT: { avg: 12 } } }} />,
  );

  expect(screen.getAllByLabelText("PSA 10 Sell price")[0]).toHaveValue(null);
  expect(screen.getAllByLabelText("PSA 9 Sell price")[0]).toHaveValue(null);
  expect(screen.getByLabelText("Raw market value")).toHaveValue(12);
  fireEvent.change(screen.getAllByLabelText("PSA 9 Sell price")[0], {
    target: { value: "80" },
  });

  rerender(
    <GradingCalculator
      prices={{
        tcgplayer: { NEAR_MINT: { avg: 20 } },
        ebay: {
          PSA_10: { saleCount: 15, avg: 539 },
          PSA_9: { saleCount: 15, avg: 66 },
          PSA_8: { saleCount: 15, avg: 34 },
          PSA_7: { saleCount: 15, avg: 34 },
          PSA_8_5: { saleCount: 15, avg: 30 },
        },
      }}
    />,
  );

  expect(screen.getAllByLabelText("PSA 10 Sell price")[0]).toHaveValue(539);
  expect(screen.getAllByLabelText("PSA 9 Sell price")[0]).toHaveValue(80);
  expect(screen.getAllByLabelText("PSA 8 Sell price")[0]).toHaveValue(34);
  expect(screen.getAllByLabelText("PSA 7 Sell price")[0]).toHaveValue(34);
  expect(screen.getByLabelText("Raw market value")).toHaveValue(20);
});

test("fills prices that are already on the card, including a partial set", () => {
  render(
    <GradingCalculator
      prices={{
        tcgplayer: { NEAR_MINT: { avg: 22.5 } },
        ebay: {
          PSA_10: { saleCount: 15, avg: 539 },
          PSA_8: { saleCount: 15, avg: 34 },
        },
      }}
    />,
  );

  expect(screen.getAllByLabelText("PSA 10 Sell price")[0]).toHaveValue(539);
  expect(screen.getAllByLabelText("PSA 9 Sell price")[0]).toHaveValue(null);
  expect(screen.getAllByLabelText("PSA 8 Sell price")[0]).toHaveValue(34);
  expect(screen.getAllByLabelText("PSA 7 Sell price")[0]).toHaveValue(null);
  expect(screen.getByLabelText("Raw market value")).toHaveValue(22.5);
});

function gradeArticle(name: string) {
  const heading = screen
    .getAllByRole("heading", { name })
    .find((node) =>
      node.closest("article")?.classList.contains("grading-calculator__grade"),
    );
  const article = heading?.closest("article");
  if (!article) throw new Error(`Missing grade card ${name}`);
  return article;
}
