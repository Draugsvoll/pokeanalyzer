import assert from "node:assert/strict";
import test from "node:test";
import { implicitLocalDatabaseError } from "./databaseTargetPolicy.js";

test("database scripts reject an accidental implicit local database", () => {
  assert.match(
    implicitLocalDatabaseError(undefined) ?? "",
    /TURSO_DATABASE_URL is missing/,
  );
  assert.match(
    implicitLocalDatabaseError("   ") ?? "",
    /TURSO_DATABASE_URL is missing/,
  );
});

test("database scripts accept explicit remote configuration", () => {
  assert.equal(
    implicitLocalDatabaseError("libsql://database.example"),
    null,
  );
});
