import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const tracesTable = sqliteTable(
  "traces",
  {
    traceId: text("trace_id").primaryKey(),
    rootServiceName: text("root_service_name"),
    rootSpanName: text("root_span_name"),
    startTimeUnixNano: text("start_time_unix_nano").notNull(),
    endTimeUnixNano: text("end_time_unix_nano").notNull(),
    durationNano: text("duration_nano").notNull(),
    spanCount: integer("span_count").notNull(),
    errorCount: integer("error_count").notNull(),
    serviceCount: integer("service_count").notNull(),
    updatedAtUnixNano: text("updated_at_unix_nano").notNull(),
  },
  (table) => [
    index("traces_start_time_idx").on(table.startTimeUnixNano),
    index("traces_root_service_start_idx").on(table.rootServiceName, table.startTimeUnixNano),
  ],
);

export const spansTable = sqliteTable(
  "spans",
  {
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    parentSpanId: text("parent_span_id"),
    serviceName: text("service_name"),
    spanName: text("span_name").notNull(),
    spanKind: text("span_kind").notNull(),
    startTimeUnixNano: text("start_time_unix_nano").notNull(),
    endTimeUnixNano: text("end_time_unix_nano").notNull(),
    durationNano: text("duration_nano").notNull(),
    statusCode: text("status_code").notNull(),
    statusMessage: text("status_message"),
    traceState: text("trace_state"),
    resourceAttributesJson: text("resource_attributes_json").notNull(),
    spanAttributesJson: text("span_attributes_json").notNull(),
    eventsJson: text("events_json").notNull(),
    linksJson: text("links_json").notNull(),
    instrumentationScopeName: text("instrumentation_scope_name"),
    instrumentationScopeVersion: text("instrumentation_scope_version"),
    droppedAttributesCount: integer("dropped_attributes_count").notNull(),
    droppedEventsCount: integer("dropped_events_count").notNull(),
    droppedLinksCount: integer("dropped_links_count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.traceId, table.spanId] }),
    index("spans_service_start_idx").on(table.serviceName, table.startTimeUnixNano),
    index("spans_service_name_start_idx").on(
      table.serviceName,
      table.spanName,
      table.startTimeUnixNano,
    ),
  ],
);

export const servicesTable = sqliteTable("services", {
  serviceName: text("service_name").primaryKey(),
  lastSeenUnixNano: text("last_seen_unix_nano").notNull(),
});

export const operationsTable = sqliteTable(
  "operations",
  {
    serviceName: text("service_name").notNull(),
    spanName: text("span_name").notNull(),
    spanKind: text("span_kind").notNull(),
    lastSeenUnixNano: text("last_seen_unix_nano").notNull(),
  },
  (table) => [
    uniqueIndex("operations_unique_idx").on(table.serviceName, table.spanName, table.spanKind),
    index("operations_service_idx").on(table.serviceName),
  ],
);

export const indexedAttributesTable = sqliteTable(
  "indexed_attributes",
  {
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    index("indexed_attributes_lookup_idx").on(table.key, table.value, table.traceId),
    index("indexed_attributes_span_idx").on(table.traceId, table.spanId),
    uniqueIndex("indexed_attributes_unique_idx").on(
      table.traceId,
      table.spanId,
      table.key,
      table.value,
    ),
  ],
);

export const collectorMetaTable = sqliteTable("collector_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
