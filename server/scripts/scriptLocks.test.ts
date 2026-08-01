import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  buildAcquireScriptLock,
  buildRenewScriptLock,
  SCHEDULED_MAINTENANCE_LOCK_NAME,
  SCRIPT_LOCK_TABLE_SQL,
} from "./scriptLocks.js";

test("script locks block overlap for the shared maintenance lock", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    await client.execute(SCRIPT_LOCK_TABLE_SQL);
    const acquire = async (name: string, token: string) =>
      client.execute(buildAcquireScriptLock(name, token, 900));

    const cardSync = await acquire(
      SCHEDULED_MAINTENANCE_LOCK_NAME,
      "cards-one",
    );
    assert.equal(cardSync.rows[0]?.token, "cards-one");

    const overlappingCardSync = await acquire(
      SCHEDULED_MAINTENANCE_LOCK_NAME,
      "cards-two",
    );
    assert.equal(overlappingCardSync.rows.length, 0);
  } finally {
    client.close();
  }
});

test("script locks renew only for the active token", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    await client.execute(SCRIPT_LOCK_TABLE_SQL);
    await client.execute(
      buildAcquireScriptLock(SCHEDULED_MAINTENANCE_LOCK_NAME, "active", 900),
    );

    const wrongTokenRenewal = await client.execute(
      buildRenewScriptLock(SCHEDULED_MAINTENANCE_LOCK_NAME, "stale", 900),
    );
    assert.equal(wrongTokenRenewal.rowsAffected, 0);

    const activeRenewal = await client.execute(
      buildRenewScriptLock(SCHEDULED_MAINTENANCE_LOCK_NAME, "active", 900),
    );
    assert.equal(activeRenewal.rowsAffected, 1);
  } finally {
    client.close();
  }
});
