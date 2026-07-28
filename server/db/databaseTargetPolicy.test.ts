import assert from "node:assert/strict";
import test from "node:test";
import { implicitLocalDatabaseError } from "./databaseTargetPolicy.js";

test("database scripts reject an accidental implicit local database", () => {
  assert.match(
    implicitLocalDatabaseError(undefined, undefined) ?? "",
    /TURSO_DATABASE_URL is missing/,
  );
  assert.match(
    implicitLocalDatabaseError("   ", "false") ?? "",
    /Refusing to use the implicit local database/,
  );
});

test("database scripts accept explicit remote or local configuration", () => {
  assert.equal(
    implicitLocalDatabaseError("libsql://database.example", undefined),
    null,
  );
  assert.equal(implicitLocalDatabaseError(undefined, "TRUE"), null);
});
