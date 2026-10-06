import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import {
  fetchSealedFilterOptions,
  searchSealedProducts,
} from "../../services/sealedApi";
import {
  SealedDatabaseSearchBar,
  SealedDatabaseSearchResults,
} from "./SealedDatabaseSearch";
import { useSealedDatabaseSearch } from "./useSealedDatabaseSearch";

vi.mock("../../services/sealedApi", () => ({
  fetchSealedFilterOptions: vi.fn(),
  searchSealedProducts: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchSealedFilterOptions).mockReset();
  vi.mocked(searchSealedProducts).mockReset();
  vi.mocked(fetchSealedFilterOptions).mockResolvedValue({
    productFamilies: ["booster_box"],
    setNames: ["XY Base Set"],
  });
  vi.mocked(searchSealedProducts).mockResolvedValue({ items: [], total: 0 });
});

function SealedSearchHarness() {
  const search = useSealedDatabaseSearch(true);
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <SealedDatabaseSearchBar search={search} />
      <SealedDatabaseSearchResults search={search} />
      <output aria-label="Current search">{location.search}</output>
      <button onClick={() => navigate(-1)} type="button">
        Back
      </button>
    </>
  );
}

test("prefills and searches the sealed set from the URL", async () => {
  render(
    <MemoryRouter initialEntries={["/sealed?set=XY%20Base%20Set"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  expect(screen.getByRole("combobox", { name: "Set name" })).toHaveValue(
    "XY Base Set",
  );
  await waitFor(() => {
    expect(searchSealedProducts).toHaveBeenCalledWith(
      { name: "", productFamily: "", setName: "XY Base Set" },
      expect.any(AbortSignal),
    );
  });
  expect(
    await screen.findByText("No sealed products matched your search."),
  ).toBeInTheDocument();
});

test("stores sealed criteria in history and restores searches on Back", async () => {
  render(
    <MemoryRouter initialEntries={["/sealed"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  const nameInput = screen.getByRole("textbox", {
    name: "Sealed product name",
  });
  fireEvent.change(nameInput, { target: { value: "first box" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() => {
    expect(searchSealedProducts).toHaveBeenLastCalledWith(
      {
        name: "first box",
        productFamily: "",
        setName: "",
      },
      expect.any(AbortSignal),
    );
  });
  expect(screen.getByLabelText("Current search")).toHaveTextContent(
    "?mode=sealed&name=first+box",
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });
  fireEvent.change(nameInput, { target: { value: "second box" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() => {
    expect(searchSealedProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "second box" }),
      expect.any(AbortSignal),
    );
  });

  fireEvent.click(screen.getByRole("button", { name: "Back" }));

  await waitFor(() => {
    expect(nameInput).toHaveValue("first box");
    expect(searchSealedProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "first box" }),
      expect.any(AbortSignal),
    );
  });
});

test("writes every submitted Sealed filter to the URL", async () => {
  render(
    <MemoryRouter initialEntries={["/sealed"]}>
      <SealedSearchHarness />
    </MemoryRouter>,
  );

  fireEvent.change(
    screen.getByRole("textbox", { name: "Sealed product name" }),
    { target: { value: "Booster" } },
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Set name" }), {
    target: { value: "XY Base Set" },
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Product type" })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole("button", { name: "Product type" }));
  fireEvent.click(await screen.findByRole("option", { name: "Booster Box" }));
  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum price" }), {
    target: { value: "100" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum price" }), {
    target: { value: "500" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await waitFor(() => {
    const params = new URLSearchParams(
      screen.getByLabelText("Current search").textContent ?? "",
    );
    expect(Object.fromEntries(params)).toEqual({
      max: "500",
      min: "100",
      mode: "sealed",
      name: "Booster",
      set: "XY Base Set",
      type: "booster_box",
    });
  });
});
