import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrokLoadingState } from "./GrokLoadingState";

describe("GrokLoadingState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("changes to the research message after a random five to ten second delay", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<GrokLoadingState>Building market report...</GrokLoadingState>);

    expect(screen.getByText("Building market report...")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5_000));

    expect(
      screen.getByText("Comparing sources, this might take a minute..."),
    ).toBeInTheDocument();
  });
});
