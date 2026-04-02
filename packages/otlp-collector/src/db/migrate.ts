import type { CollectorDatabase } from "./client";

const SCHEMA_VERSION = "1";

export const migrateCollectorDatabase = (database: CollectorDatabase): void => {
  database.sqlite.run(`
    CREATE TABLE IF NOT EXISTS collector_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traces (
      trace_id TEXT PRIMARY KEY NOT NULL,
      root_service_name TEXT,
      root_span_name TEXT,
      start_time_unix_nano TEXT NOT NULL,
      end_time_unix_nano TEXT NOT NULL,
      duration_nano TEXT NOT NULL,
      span_count INTEGER NOT NULL,
      error_count INTEGER NOT NULL,
      service_count INTEGER NOT NULL,
      updated_at_unix_nano TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spans (
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL,
      parent_span_id TEXT,
      service_name TEXT,
      span_name TEXT NOT NULL,
      span_kind TEXT NOT NULL,
      start_time_unix_nano TEXT NOT NULL,
      end_time_unix_nano TEXT NOT NULL,
      duration_nano TEXT NOT NULL,
      status_code TEXT NOT NULL,
      status_message TEXT,
      trace_state TEXT,
      resource_attributes_json TEXT NOT NULL,
      span_attributes_json TEXT NOT NULL,
      events_json TEXT NOT NULL,
      links_json TEXT NOT NULL,
      instrumentation_scope_name TEXT,
      instrumentation_scope_version TEXT,
      dropped_attributes_count INTEGER NOT NULL,
      dropped_events_count INTEGER NOT NULL,
      dropped_links_count INTEGER NOT NULL,
      PRIMARY KEY (trace_id, span_id)
    );

    CREATE TABLE IF NOT EXISTS services (
      service_name TEXT PRIMARY KEY NOT NULL,
      last_seen_unix_nano TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS operations (
      service_name TEXT NOT NULL,
      span_name TEXT NOT NULL,
      span_kind TEXT NOT NULL,
      last_seen_unix_nano TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS indexed_attributes (
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS traces_start_time_idx ON traces (start_time_unix_nano);
    CREATE INDEX IF NOT EXISTS traces_root_service_start_idx ON traces (root_service_name, start_time_unix_nano);
    CREATE INDEX IF NOT EXISTS spans_service_start_idx ON spans (service_name, start_time_unix_nano);
    CREATE INDEX IF NOT EXISTS spans_service_name_start_idx ON spans (service_name, span_name, start_time_unix_nano);
    CREATE INDEX IF NOT EXISTS operations_service_idx ON operations (service_name);
    CREATE UNIQUE INDEX IF NOT EXISTS operations_unique_idx ON operations (service_name, span_name, span_kind);
    CREATE INDEX IF NOT EXISTS indexed_attributes_lookup_idx ON indexed_attributes (key, value, trace_id);
    CREATE INDEX IF NOT EXISTS indexed_attributes_span_idx ON indexed_attributes (trace_id, span_id);
    CREATE UNIQUE INDEX IF NOT EXISTS indexed_attributes_unique_idx ON indexed_attributes (trace_id, span_id, key, value);
  `);

  database.sqlite
    .query("INSERT OR REPLACE INTO collector_meta (key, value) VALUES ($key, $value)")
    .run({ key: "schema_version", value: SCHEMA_VERSION });
};
