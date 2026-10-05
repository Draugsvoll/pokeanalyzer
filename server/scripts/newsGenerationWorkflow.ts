export type NewsGenerationResult<Payload> =
  { ok: true; payload: Payload } | { ok: false; error: Error };

export type NewsGenerationTask<Payload> = {
  name: string;
  generate: () => Promise<NewsGenerationResult<Payload>>;
  save: (payload: Payload) => Promise<Error | null>;
  skip?: boolean;
};

export type NewsGenerationFailure = {
  name: string;
  error: Error;
};

async function runNewsGenerationTask<Payload>(
  task: NewsGenerationTask<Payload>,
): Promise<NewsGenerationFailure | null> {
  if (task.skip) return null;

  const result = await task.generate();
  if (!result.ok) return { name: task.name, error: result.error };

  const error = await task.save(result.payload);
  return error ? { name: task.name, error } : null;
}

export async function runNewsGenerationWorkflow<
  GeneralNewsPayload,
  MarketSummaryPayload,
>(
  generalNews: NewsGenerationTask<GeneralNewsPayload>,
  marketSummary: NewsGenerationTask<MarketSummaryPayload>,
): Promise<NewsGenerationFailure[]> {
  const failures: NewsGenerationFailure[] = [];

  const generalNewsFailure = await runNewsGenerationTask(generalNews);
  if (generalNewsFailure) failures.push(generalNewsFailure);

  const marketSummaryFailure = await runNewsGenerationTask(marketSummary);
  if (marketSummaryFailure) failures.push(marketSummaryFailure);

  return failures;
}
