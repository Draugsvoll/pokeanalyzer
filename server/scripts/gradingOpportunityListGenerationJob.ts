import type { Client } from "@libsql/client";
import { GRADING_OPPORTUNITY_QUALIFICATIONS } from "../config/gradingOpportunities.js";
import { findGradingOpportunities } from "../services/gradingOpportunities.js";
import {
  ensureGradingOpportunityListStore,
  saveGradingOpportunityList,
} from "../services/gradingOpportunityList.js";
import type { GradingOpportunityList } from "../../shared/gradingOpportunityList.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";

export async function runGradingOpportunityListGeneration(
  database: Client,
): Promise<GradingOpportunityList | null> {
  let payload: GradingOpportunityList | null = null;
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    await ensureGradingOpportunityListStore(database);
    const result = await findGradingOpportunities(database, {
      ...GRADING_OPPORTUNITY_QUALIFICATIONS,
      limit: null,
    });
    const list: GradingOpportunityList = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      items: result.items.map(({ cardId, psaPrice }) => ({
        cardId,
        psa10Price: psaPrice,
      })),
    };
    assertHeld();
    await saveGradingOpportunityList(database, list);
    payload = list;
  }, database);
  return acquired ? payload : null;
}
