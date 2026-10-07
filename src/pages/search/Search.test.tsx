import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import Search from "./Search";

vi.mock("../../components/databaseSearch/DatabaseSearch", () => ({
  DatabaseSearch: ({
    initialProductType,
  }: {
    initialProductType?: "singles" | "sealed";
  }) => <div>Shared {initialProductType ?? "singles"} search</div>,
}));

vi.mock("../../components/mostSoldGrid/MostSoldGrid", () => ({
  MostSoldGrid: ({ title }: { title: string }) => <section>{title}</section>,
}));

vi.mock("../../components/marketMoversGrid/MarketMoversGrid", () => ({
  MarketMoversGrid: ({ title }: { title: string }) => (
    <section>{title}</section>
  ),
}));

test("uses the shared search experience without replacing market sections", () => {
  render(
    <MemoryRouter>
      <Search />
    </MemoryRouter>,
  );

  expect(screen.getByText("Shared singles search")).toBeInTheDocument();
  expect(screen.getByText("TCG Most Sold Daily")).toBeInTheDocument();
  expect(screen.getByText("TCG Daily Gainers")).toBeInTheDocument();
});

test("can initialize that same search experience in sealed mode", () => {
  render(
    <MemoryRouter>
      <Search initialProductType="sealed" />
    </MemoryRouter>,
  );

  expect(screen.getByText("Shared sealed search")).toBeInTheDocument();
});
