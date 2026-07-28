import type {
  BiggestMoversPayload,
  GeneralNewsPayload,
  NewsFeedsResponse,
} from "../../src/types/news.js";
import {
  parseBiggestMoversResponse,
  parseGeneralNewsResponse,
} from "../scripts/newsGeneration.js";
import { dbAll, dbExecute } from "./db.js";
import { findMissingColumns } from "./schemaValidationPolicy.js";

export const NEWS_FEEDS = {
  biggestMovers: "biggest_movers",
  generalNews: "general_news",
} as const;

export type NewsFeed = (typeof NEWS_FEEDS)[keyof typeof NEWS_FEEDS];

type NewsContentRow = {
  [key: string]: unknown;
  feed: unknown;
  payload_json: unknown;
};

type TableInfoRow = {
  [key: string]: unknown;
  name: unknown;
};

const REQUIRED_NEWS_COLUMNS = [
  "feed",
  "payload_json",
  "source_date",
  "updated_at",
] as const;

export const NEWS_CONTENT_UPSERT_SQL = `
  INSERT INTO news_content (
    feed,
    payload_json,
    source_date,
    updated_at
  )
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(feed) DO UPDATE SET
    payload_json = excluded.payload_json,
    source_date = excluded.source_date,
    updated_at = CURRENT_TIMESTAMP
`;

export async function assertNewsContentSchemaCompatible(): Promise<void> {
  const rows = await dbAll<TableInfoRow>('PRAGMA table_info("news_content")');
  if (rows.length === 0) {
    throw new Error(
      "Database schema is incompatible: news_content table is missing. Run npm run db:init before generating news.",
    );
  }

  const missingColumns = findMissingColumns(
    rows.map((row) => String(row.name)),
    REQUIRED_NEWS_COLUMNS,
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `Database schema is incompatible: news_content is missing ${missingColumns.join(", ")}. Run npm run db:init or migrate the existing table.`,
    );
  }
}

export async function saveNewsFeed(
  feed: typeof NEWS_FEEDS.generalNews,
  payload: GeneralNewsPayload,
): Promise<void>;
export async function saveNewsFeed(
  feed: typeof NEWS_FEEDS.biggestMovers,
  payload: BiggestMoversPayload,
): Promise<void>;
export async function saveNewsFeed(
  feed: NewsFeed,
  payload: GeneralNewsPayload | BiggestMoversPayload,
): Promise<void> {
  const sourceDate = "date" in payload ? payload.date : null;

  await dbExecute(NEWS_CONTENT_UPSERT_SQL, [
    feed,
    JSON.stringify(payload),
    sourceDate,
  ]);
}

export function parseStoredNewsRows(rows: NewsContentRow[]): NewsFeedsResponse {
  let generalNews: GeneralNewsPayload | null = null;
  let biggestMovers: BiggestMoversPayload | null = null;
  const seenFeeds = new Set<string>();

  for (const row of rows) {
    const feed = String(row.feed);
    if (seenFeeds.has(feed)) {
      throw new Error(`Duplicate stored news feed: ${feed}`);
    }
    seenFeeds.add(feed);

    if (typeof row.payload_json !== "string") {
      throw new Error(`Stored ${feed} payload must be JSON text`);
    }

    if (feed === NEWS_FEEDS.generalNews) {
      generalNews = parseGeneralNewsResponse(row.payload_json);
    } else if (feed === NEWS_FEEDS.biggestMovers) {
      biggestMovers = parseBiggestMoversResponse(row.payload_json);
    } else {
      throw new Error(`Unknown stored news feed: ${feed}`);
    }
  }

  return { generalNews, biggestMovers };
}

export async function getNewsFeeds(): Promise<NewsFeedsResponse> {
  const rows = await dbAll<NewsContentRow>(
    `
      SELECT feed, payload_json
      FROM news_content
      WHERE feed IN (?, ?)
    `,
    [NEWS_FEEDS.generalNews, NEWS_FEEDS.biggestMovers],
  );

  return parseStoredNewsRows(rows);
}
