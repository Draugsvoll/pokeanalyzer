type ErrorWithMetadata = Error & {
  code?: unknown;
  requestId?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function safeText(value: unknown) {
  if (typeof value !== "string") return undefined;

  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bxai-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bwhsec_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(
      /\b(api[_-]?key|secret|token|password)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[redacted-key]")
    .slice(0, 300);
}

export function getSafeErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: "UnknownError" };
  }

  const metadata = error as ErrorWithMetadata;
  return {
    name: error.name,
    message: safeText(error.message),
    ...(typeof metadata.code === "string" && { code: safeText(metadata.code) }),
    ...(typeof metadata.requestId === "string" && {
      requestId: safeText(metadata.requestId),
    }),
    ...(typeof metadata.status === "number" && { status: metadata.status }),
    ...(typeof metadata.statusCode === "number" && {
      statusCode: metadata.statusCode,
    }),
  };
}

export function logError(context: string, error: unknown) {
  console.error(context, getSafeErrorDetails(error));
}
