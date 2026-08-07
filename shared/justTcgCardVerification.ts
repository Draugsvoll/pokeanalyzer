export type JustTcgVerifiableCard = {
  number?: string | number;
  set_name?: string;
  setName?: string;
};

export function normalizeJustTcgCardNumber(value: string | number) {
  const numberBeforeSlash = String(value).trim().split("/")[0];
  return numberBeforeSlash.replace(/^0+(?=\d)/, "");
}

export function justTcgSetNamesMatch(first?: string, second?: string) {
  const normalizedFirst = first?.trim().toLowerCase();
  const normalizedSecond = second?.trim().toLowerCase();
  if (!normalizedFirst || !normalizedSecond) return false;

  return (
    normalizedFirst.includes(normalizedSecond) ||
    normalizedSecond.includes(normalizedFirst)
  );
}

export function isVerifiedJustTcgCard(
  candidate: JustTcgVerifiableCard,
  expectedSetName: string,
  expectedNumber: string | number,
) {
  const candidateSetName = candidate.setName ?? candidate.set_name;
  if (!candidateSetName || candidate.number == null) return false;

  return (
    justTcgSetNamesMatch(expectedSetName, candidateSetName) &&
    normalizeJustTcgCardNumber(candidate.number) ===
      normalizeJustTcgCardNumber(expectedNumber)
  );
}
