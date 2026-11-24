export type PokeTracePsaPopulationGrade = {
  grade: string;
  count: number;
  qualified: number;
};

export type PokeTracePsaPopulation = {
  total: number;
  gemRate: number | null;
  updatedAt: string;
  grades: PokeTracePsaPopulationGrade[];
  authentic?: number;
};

export const POKE_TRACE_POPULATION_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
export const POKE_TRACE_POPULATION_MISSING_FRESH_MS =
  30 * 24 * 60 * 60 * 1000;

export function isPokeTracePopulationFresh(
  population: PokeTracePsaPopulation | null | undefined,
  checkedAt: string | undefined,
  now = Date.now(),
) {
  if (!checkedAt) return false;
  const checked = Date.parse(checkedAt);
  if (!Number.isFinite(checked)) return false;
  const maxAge =
    population == null
      ? POKE_TRACE_POPULATION_MISSING_FRESH_MS
      : POKE_TRACE_POPULATION_FRESH_MS;
  return now - checked < maxAge;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAuthenticGrade(grade: string) {
  const key = grade.trim().toLowerCase();
  return key === "authentic" || key === "auth";
}

export function parsePokeTracePsaPopulation(
  value: unknown,
): PokeTracePsaPopulation | undefined {
  if (!isRecord(value) || typeof value.total !== "number") return undefined;
  if (!Array.isArray(value.grades)) return undefined;
  const grades: PokeTracePsaPopulationGrade[] = [];
  let authenticFromGrades = 0;
  for (const entry of value.grades) {
    if (!isRecord(entry) || typeof entry.grade !== "string") continue;
    if (typeof entry.count !== "number") continue;
    if (isAuthenticGrade(entry.grade)) {
      authenticFromGrades += entry.count;
      continue;
    }
    grades.push({
      grade: entry.grade,
      count: entry.count,
      qualified: typeof entry.qualified === "number" ? entry.qualified : 0,
    });
  }
  const authenticFromField =
    typeof value.authentic === "number" ? value.authentic : 0;
  const authentic =
    authenticFromField > 0 ? authenticFromField : authenticFromGrades;
  return {
    total: value.total,
    gemRate: typeof value.gemRate === "number" ? value.gemRate : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    grades,
    ...(authentic > 0 ? { authentic } : {}),
  };
}
