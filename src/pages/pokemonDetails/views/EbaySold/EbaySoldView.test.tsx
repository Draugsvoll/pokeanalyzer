import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { authenticatedFetch } from "../../../../utils/authenticatedFetch";
import type { PokemonCard } from "../../../../types/pokemon";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import EbaySoldView from "./EbaySoldView";

vi.mock("../../../../utils/authenticatedFetch", () => ({
  authenticatedFetch: vi.fn(),
}));

const card: PokemonCard = {
  id: "card-a",
  name: "Pikachu",
  image: "card-a.png",
  set: { id: "base1", name: "Base Set" },
  pokeTrace: {
    currency: "USD",
    marketplaceUrls: {},
    prices: {},
    variant: "Normal",
    variants: [{ id: "card-a", name: "Normal" }],
  },
};

test("changing the credit callback does not repeat a completed request, but a new run token does", async () => {
  vi.mocked(authenticatedFetch)
    .mockReset()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            subscription: {},
            data: { sold: [], active: [] },
          }),
        ),
    );
  const onSubscriptionChange = vi.fn();
  const originalCallback = vi.fn().mockResolvedValue(null);
  const latestCallback = vi.fn().mockResolvedValue(null);
  const props = { card, runToken: 1, onSubscriptionChange };
  const { rerender } = render(
    <EbaySoldView {...props} onCreditRejected={originalCallback} />,
  );
  await waitFor(() => expect(onSubscriptionChange).toHaveBeenCalledTimes(1));

  rerender(<EbaySoldView {...props} onCreditRejected={latestCallback} />);
  expect(authenticatedFetch).toHaveBeenCalledTimes(1);

  rerender(
    <EbaySoldView {...props} runToken={2} onCreditRejected={latestCallback} />,
  );
  await waitFor(() => expect(onSubscriptionChange).toHaveBeenCalledTimes(2));
  expect(authenticatedFetch).toHaveBeenCalledTimes(2);
  expect(originalCallback).not.toHaveBeenCalled();
  expect(latestCallback).not.toHaveBeenCalled();
});

test("an in-flight credit rejection calls the latest callback without restarting the request", async () => {
  let resolveResponse!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  vi.mocked(authenticatedFetch).mockReset().mockReturnValue(response);
  const originalCallback = vi.fn().mockResolvedValue(null);
  const latestCallback = vi.fn().mockResolvedValue(null);
  const { rerender } = render(
    <EbaySoldView
      card={card}
      runToken={1}
      onCreditRejected={originalCallback}
    />,
  );

  rerender(
    <EbaySoldView card={card} runToken={1} onCreditRejected={latestCallback} />,
  );
  expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveResponse(
      new Response(JSON.stringify({ error: "Not enough credits" }), {
        status: 409,
      }),
    );
  });

  expect(await screen.findByText(FEATURE_ERROR_MESSAGE)).toBeVisible();
  expect(originalCallback).not.toHaveBeenCalled();
  expect(latestCallback).toHaveBeenCalledTimes(1);
  expect(authenticatedFetch).toHaveBeenCalledTimes(1);
});

test.each([409, 502])(
  "refreshes credits only for an eBay credit rejection (HTTP %s)",
  async (status) => {
    vi.mocked(authenticatedFetch)
      .mockReset()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Request rejected" }), { status }),
      );
    const onCreditRejected = vi.fn().mockResolvedValue(null);
    const onSubscriptionChange = vi.fn();
    const props = { card, runToken: 1, onCreditRejected, onSubscriptionChange };

    const { rerender } = render(<EbaySoldView {...props} />);

    expect(await screen.findByText(FEATURE_ERROR_MESSAGE)).toBeVisible();
    expect(onCreditRejected).toHaveBeenCalledTimes(status === 409 ? 1 : 0);
    expect(onSubscriptionChange).not.toHaveBeenCalled();

    rerender(<EbaySoldView {...props} />);
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(1));
  },
);
