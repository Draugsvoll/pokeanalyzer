import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Client } from "@libsql/client";
import { writeMarketCategories } from "./marketCategoryExport.js";

test("atomically replaces an existing market-category file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "market-categories-"));
  const outputPath = path.join(directory, "market-categories.json");

  try {
    await writeFile(outputPath, "previous contents", "utf8");

    const payload = await writeMarketCategories(
      {} as Pick<Client, "execute">,
      outputPath,
      [],
    );

    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), payload);
    assert.deepEqual(await readdir(directory), ["market-categories.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
