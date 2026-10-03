import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "./userFacingError";

describe("getAuthErrorMessage", () => {
  it("maps known authentication errors to clear user-facing English", () => {
    expect(
      getAuthErrorMessage(
        { code: "auth/invalid-credential" },
        "Fallback message",
      ),
    ).toBe("The email address or password is incorrect.");
    expect(
      getAuthErrorMessage(
        { code: "auth/email-not-verified" },
        "Fallback message",
      ),
    ).toBe(
      "Verify your email address before logging in. Check your inbox and spam folder.",
    );
  });

  it("does not expose unknown error messages", () => {
    expect(
      getAuthErrorMessage(
        Object.assign(new Error("database connection failed"), {
          code: "auth/internal-error",
        }),
        "Please try again.",
      ),
    ).toBe("Please try again.");
  });
});
