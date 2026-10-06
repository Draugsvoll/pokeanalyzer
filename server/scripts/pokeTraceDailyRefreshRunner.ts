export type PokeTraceDailyRefreshStatuses = {
  sealed: number;
  singles: number;
};

export async function runPokeTraceDailyRefreshes(
  run: (job: "singles" | "sealed") => Promise<number>,
): Promise<PokeTraceDailyRefreshStatuses> {
  const singles = await run("singles");
  const sealed = await run("sealed");
  return { singles, sealed };
}

export function pokeTraceDailyRefreshExitCode(
  statuses: PokeTraceDailyRefreshStatuses,
) {
  return statuses.singles === 0 && statuses.sealed === 0 ? 0 : 1;
}
