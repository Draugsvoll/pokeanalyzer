import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { SealedProductView } from "./SealedProductView";

test("renders the sealed product family and variant", () => {
  render(
    <MemoryRouter>
      <SealedProductView
        product={{
          id: "019bff85-5452-714a-9660-a3559a2d5d95",
          name: "XY Booster Box",
          setName: "XY Base Set",
          productFamily: "booster_box",
          variant: "pokemon_center_exclusive",
          currency: "USD",
          price: 150,
          priceSnapshots: { "1d": null, "7d": 125, "30d": null },
        }}
      />
    </MemoryRouter>,
  );

  expect(screen.getByText("Booster Box")).toBeInTheDocument();
  expect(screen.getByText("Pokemon Center Exclusive")).toBeInTheDocument();
});

test("replaces a broken product image with a clean fallback", () => {
  render(
    <MemoryRouter>
      <SealedProductView
        product={{
          id: "product-with-broken-image",
          name: "Broken Image Box",
          setName: "Example Set",
          productFamily: "booster_box",
          variant: "normal",
          currency: "USD",
          image: "https://example.com/missing.jpg",
          price: 100,
          priceSnapshots: { "1d": null, "7d": null, "30d": null },
        }}
      />
    </MemoryRouter>,
  );

  const image = document.querySelector(".sealed-product-view__image-shell img");
  expect(image).toBeInTheDocument();
  fireEvent.error(image!);
  expect(image).not.toBeInTheDocument();
  expect(screen.queryByText("Image unavailable")).not.toBeInTheDocument();
});
