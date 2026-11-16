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

const row = await client.execute(
  "SELECT payload_json FROM poketrace_grading_opportunities WHERE id = 'current'",
);
const json = row.rows[0]?.payload_json;
if (typeof json !== "string") {
  console.log("no current row");
} else {
  const list = JSON.parse(json);
  const generated = Date.parse(list.generatedAt);
  const ageHours = (Date.now() - generated) / 36e5;
  console.log(
    JSON.stringify(
      {
        schemaVersion: list.schemaVersion,
        generatedAt: list.generatedAt,
        ageHours: Math.round(ageHours * 10) / 10,
        freshUnder49h: ageHours >= 0 && ageHours < 49,
        itemCount: Array.isArray(list.items) ? list.items.length : null,
      },
      null,
      2,
    ),
  );
}
client.close();
