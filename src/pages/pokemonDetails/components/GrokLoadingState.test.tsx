import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrokLoadingState } from "./GrokLoadingState";
import { CardFeatureHeader } from "./CardFeatureHeader";
import { LineChart } from "lucide-react";

describe("GrokLoadingState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("changes to the research message after a random five to ten second delay", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { rerender } = render(
      <CardFeatureHeader
        card={{ name: "Pikachu" }}
        color="orange"
        icon={LineChart}
        label="Market Analysis"
        actionLabel="1 AI credit"
        onAction={() => undefined}
        actionLoading
        actionLoadingMessage={
          <GrokLoadingState>Building market report...</GrokLoadingState>
        }
      />,
    );

    const status = screen.getByRole("status");
    const button = screen.getByRole("button");
    expect(status).toHaveTextContent("Building market report...");
    expect(button.closest("header")).toContainElement(status);
    expect(button.compareDocumentPosition(status)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(status.querySelector("svg, .app-loading-spinner")).toBeNull();
    expect(button).toBeDisabled();

    act(() => vi.advanceTimersByTime(5_000));

    expect(status).toHaveTextContent(
      "Still comparing sources. This can take a minute.",
    );

    rerender(
      <CardFeatureHeader
        card={{ name: "Pikachu" }}
        color="orange"
        icon={LineChart}
        label="Market Analysis"
        actionLabel="1 AI credit"
        onAction={() => undefined}
        errorMessage="Please try again."
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(button.closest("header")).toContainElement(
      screen.getByRole("alert"),
    );
    expect(button).toBeEnabled();
  });
});
