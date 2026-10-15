import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { AccountDropdown } from "./AccountDropdown";

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("../../context/authContextValue", () => ({
  useAuth: () => ({ logout }),
}));

function Location() {
  return <output>{useLocation().pathname}</output>;
}

function setup() {
  render(
    <MemoryRouter initialEntries={["/portfolio"]}>
      <AccountDropdown initial="O" label="Ove" />
      <Location />
    </MemoryRouter>,
  );
  return screen.getByRole("link", { name: "Ove profile" });
}

beforeEach(() => {
  logout.mockReset();
});

test("opens on hover and stays open while moving into its links", () => {
  const trigger = setup();
  fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
  const link = screen.getByRole("link", { name: "My account" });
  fireEvent.pointerLeave(trigger, {
    pointerType: "mouse",
    relatedTarget: link,
  });
  expect(link).toBeVisible();
  fireEvent.click(link);
  expect(screen.getByRole("status")).toHaveTextContent("/profile");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("navigates to the profile when clicking after mouse hover", () => {
  const trigger = setup();
  fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(trigger);
  expect(screen.getByRole("status")).toHaveTextContent("/profile");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("ignores touch hover and navigates on the first tap", () => {
  const trigger = setup();
  fireEvent.pointerEnter(trigger, { pointerType: "touch" });
  fireEvent.mouseEnter(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  fireEvent.pointerLeave(trigger, { pointerType: "touch" });
  expect(screen.getByRole("status")).toHaveTextContent("/profile");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("supports keyboard focus, Escape, outside pointer, and focus dismissal", () => {
  const trigger = setup();
  act(() => trigger.focus());
  act(() => screen.getByRole("link", { name: "My account" }).focus());
  fireEvent.keyDown(document, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
  fireEvent.pointerDown(document.body);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
  fireEvent.blur(trigger, { relatedTarget: document.body });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("logs out once, disables the pending action, and returns home", async () => {
  let resolveLogout!: () => void;
  logout.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveLogout = resolve;
      }),
  );
  fireEvent.pointerEnter(setup(), { pointerType: "mouse" });
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
  expect(screen.getByRole("button", { name: "Logging out…" })).toBeDisabled();
  await act(async () => resolveLogout());
  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent(/^\/$/);
});

test("keeps a failed logout retryable without navigating away", async () => {
  logout.mockRejectedValue(new Error("offline"));
  fireEvent.pointerEnter(setup(), { pointerType: "mouse" });
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to log out"),
  );
  expect(screen.getByRole("button", { name: "Log out" })).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent("/portfolio");
});
