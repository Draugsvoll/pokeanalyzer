function redact(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bxai-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bwhsec_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(
      /\b(api[_-]?key|secret|token|password)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .slice(0, 300);
}

export function logClientError(context: string, error: unknown) {
  if (!import.meta.env.DEV) return;

  console.error(context, {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? redact(error.message) : undefined,
  });
}
