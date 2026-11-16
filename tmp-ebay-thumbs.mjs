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

const result = await client.execute({
  sql: `SELECT saved_responses FROM poketrace_cards WHERE id = ?`,
  args: ["01a0a877-ed5b-71e8-bb2a-c62f40aa3697"],
});
const saved = JSON.parse(String(result.rows[0].saved_responses));
const ebay = saved.ebay;
function summarize(side) {
  const items = ebay?.[side]?.items ?? [];
  const missing = items.filter((item) => !item.thumbnailUrl && !item.image && !item.imageUrl && !item.thumbnail);
  return {
    count: items.length,
    missing: missing.length,
    sampleKeys: items[0] ? Object.keys(items[0]) : [],
    missingTitles: missing.slice(0, 8).map((item) => item.title ?? item.name ?? JSON.stringify(Object.keys(item))),
  };
}
console.log(JSON.stringify({
  sold: summarize("sold"),
  active: summarize("active"),
}, null, 2));
client.close();
