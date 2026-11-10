export class CompSniperRateLimitError extends Error {
  constructor() {
    super("CompSniper rate limit exceeded");
    this.name = "CompSniperRateLimitError";
  }
}
