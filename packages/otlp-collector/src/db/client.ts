import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export interface CollectorDatabase {
  sqlite: Database;
  drizzle: BunSQLiteDatabase<typeof schema>;
}

export const openCollectorDatabase = (dbPath: string): CollectorDatabase => {
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath, {
    create: true,
    safeIntegers: true,
    strict: true,
  });

  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA foreign_keys = ON;");
  sqlite.run("PRAGMA synchronous = NORMAL;");
  sqlite.run("PRAGMA temp_store = MEMORY;");

  return {
    sqlite,
    drizzle: drizzle({ client: sqlite, schema }),
  };
};
