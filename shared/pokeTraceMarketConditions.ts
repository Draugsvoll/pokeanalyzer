export const POKETRACE_RAW_CONDITIONS = [
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "HEAVILY_PLAYED",
  "DAMAGED",
] as const;

export type PokeTraceRawCondition = (typeof POKETRACE_RAW_CONDITIONS)[number];

export const POKETRACE_RAW_CONDITION_LABELS: Record<
  PokeTraceRawCondition,
  string
> = {
  NEAR_MINT: "Near Mint",
  LIGHTLY_PLAYED: "Lightly Played",
  MODERATELY_PLAYED: "Moderately Played",
  HEAVILY_PLAYED: "Heavily Played",
  DAMAGED: "Damaged",
};

export function isPokeTraceRawCondition(
  value: string,
): value is PokeTraceRawCondition {
  return (POKETRACE_RAW_CONDITIONS as readonly string[]).includes(value);
}
