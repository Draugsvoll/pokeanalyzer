import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Header } from "./Header";

const mocks = vi.hoisted(() => ({
  auth: { user: null as null | { uid: string } },
}));

vi.mock("../../context/authContextValue", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("../../subscriptions", () => ({
  useMembershipSubscription: () => ({ subscription: null }),
  useCredits: () => ({ creditsRemaining: 0 }),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("../../firebase", () => ({ db: {} }));

vi.mock("../loginmodal/Loginmodal", () => ({
  default: () => null,
}));

function renderHeader(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header", () => {
  beforeEach(() => {
    mocks.auth.user = null;
  });

  test("provides the full navigation from the compact menu", () => {
    renderHeader();

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(toggle);

    const navigation = screen.getByRole("navigation", { name: "Mobile" });
    expect(navigation).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "Home" }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "Cards" }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "Explore sets" }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "Portfolio" }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "Create account" }),
    ).toBeVisible();
  });

  test("closes the compact menu with Escape", () => {
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("navigation", { name: "Mobile" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  test.each(["/card/demo", "/sealed", "/sealed/product-1"])(
    "keeps Cards active on %s",
    (initialEntry) => {
      renderHeader(initialEntry);

      expect(screen.getAllByRole("link", { name: "Cards" })[0]).toHaveAttribute(
        "aria-current",
        "page",
      );
    },
  );
});
