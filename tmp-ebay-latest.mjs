import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const client = createClient({
  url: env.POKETRACE_DATABASE_URL_V2,
  authToken: env.POKETRACE_DATABASE_AUTH_TOKEN_V2,
});

const result = await client.execute(`
  SELECT id, name, set_name, card_number,
         json_extract(saved_responses, '$.ebay.timestamp') AS ebay_ts,
         json_extract(saved_responses, '$.ebay.request_query') AS ebay_q,
         json_extract(saved_responses, '$.ebay_raw.timestamp') AS raw_ts,
         json_extract(saved_responses, '$.ebay_raw.request_query') AS raw_q
  FROM poketrace_cards
  WHERE json_extract(saved_responses, '$.ebay.timestamp') IS NOT NULL
     OR json_extract(saved_responses, '$.ebay_raw.timestamp') IS NOT NULL
  ORDER BY MAX(
    IFNULL(json_extract(saved_responses, '$.ebay.timestamp'), ''),
    IFNULL(json_extract(saved_responses, '$.ebay_raw.timestamp'), '')
  ) DESC
  LIMIT 8
`);
console.log(JSON.stringify(result.rows, null, 2));
client.close();
