import sqlite3 from "sqlite3";
import path from "path";

const dbPath = path.resolve("server/db/pokemon.sqlite");

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("SQLite error:", err.message);
  } else {
    console.log("SQLite connected");
  }
});