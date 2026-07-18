import sqlite3 from "sqlite3";
import path from "path";
import { logError } from "../security/logging.js";

const dbPath = path.resolve("server/db/pokemon.sqlite");

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logError("SQLite connection failed", err);
  } else {
    console.log("SQLite connected");
  }
});
