import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { EmbeddedCardSearchDialog } from "./EmbeddedCardSearchDialog";

vi.mock("../databaseSearch/DatabaseSearch", () => ({
  DatabaseSearch: () => (
    <>
      <button data-result-open type="button">
        Open Pikachu
      </button>
      <button data-result-open type="button">
        Open Elite Trainer Box
      </button>
    </>
  ),
}));

function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <EmbeddedCardSearchDialog
        ariaLabel="Search cards"
        isOpen
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  return onClose;
}

test("closes when a singles result is opened", () => {
  const onClose = renderDialog();
  fireEvent.click(screen.getByRole("button", { name: "Open Pikachu" }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("closes when a sealed result is opened", () => {
  const onClose = renderDialog();
  fireEvent.click(
    screen.getByRole("button", { name: "Open Elite Trainer Box" }),
  );
  expect(onClose).toHaveBeenCalledOnce();
});
