import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { CardIdentity } from "./CardIdentity";

test("renders the card number before the card name", () => {
  const { container } = render(
    <CardIdentity name="Charizard" number="004/102" />,
  );

  expect(container.querySelector(".app-card-identity")).toHaveTextContent(
    "004/102·Charizard",
  );
  expect(screen.getByTitle("Card number 004/102")).toBeVisible();
  expect(screen.getByTitle("Charizard")).toBeVisible();
});
