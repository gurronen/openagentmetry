import { desc, eq } from "drizzle-orm";
import type { CollectorDatabase } from "./client";
import {
  indexedAttributesTable,
  operationsTable,
  servicesTable,
  spansTable,
  tracesTable,
} from "./schema";
import {
  decodeSortableBigInt,
  encodeSortableBigInt,
  jsonStringify,
  jsonParseEvents,
  jsonParseLinks,
  jsonParseRecord,
} from "../normalize";
import type { AttributeValue, NormalizedSpanRecord } from "../types";

export const storeNormalizedSpans = (
  database: CollectorDatabase,
  spans: NormalizedSpanRecord[],
  indexedAttributeKeys: readonly string[],
): void => {
  if (spans.length === 0) {
    return;
  }

  const uniqueTraceIds = new Set<string>();
  const deleteIndexedAttributes = database.sqlite.query(
    "DELETE FROM indexed_attributes WHERE trace_id = $traceId AND span_id = $spanId",
  );

  const transaction = database.sqlite.transaction(() => {
    for (const span of spans) {
      uniqueTraceIds.add(span.traceId);

      database.drizzle
        .insert(spansTable)
        .values({
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          serviceName: span.serviceName,
          spanName: span.spanName,
          spanKind: span.spanKind,
          startTimeUnixNano: encodeSortableBigInt(span.startTimeUnixNano),
          endTimeUnixNano: encodeSortableBigInt(span.endTimeUnixNano),
          durationNano: encodeSortableBigInt(span.durationNano),
          statusCode: span.statusCode,
          statusMessage: span.statusMessage,
          traceState: span.traceState,
          resourceAttributesJson: jsonStringify(span.resourceAttributes),
          spanAttributesJson: jsonStringify(span.spanAttributes),
          eventsJson: jsonStringify(span.events),
          linksJson: jsonStringify(span.links),
          instrumentationScopeName: span.instrumentationScopeName,
          instrumentationScopeVersion: span.instrumentationScopeVersion,
          droppedAttributesCount: span.droppedAttributesCount,
          droppedEventsCount: span.droppedEventsCount,
          droppedLinksCount: span.droppedLinksCount,
        })
        .onConflictDoUpdate({
          target: [spansTable.traceId, spansTable.spanId],
          set: {
            parentSpanId: span.parentSpanId,
            serviceName: span.serviceName,
            spanName: span.spanName,
            spanKind: span.spanKind,
            startTimeUnixNano: encodeSortableBigInt(span.startTimeUnixNano),
            endTimeUnixNano: encodeSortableBigInt(span.endTimeUnixNano),
            durationNano: encodeSortableBigInt(span.durationNano),
            statusCode: span.statusCode,
            statusMessage: span.statusMessage,
            traceState: span.traceState,
            resourceAttributesJson: jsonStringify(span.resourceAttributes),
            spanAttributesJson: jsonStringify(span.spanAttributes),
            eventsJson: jsonStringify(span.events),
            linksJson: jsonStringify(span.links),
            instrumentationScopeName: span.instrumentationScopeName,
            instrumentationScopeVersion: span.instrumentationScopeVersion,
            droppedAttributesCount: span.droppedAttributesCount,
            droppedEventsCount: span.droppedEventsCount,
            droppedLinksCount: span.droppedLinksCount,
          },
        })
        .run();

      if (span.serviceName) {
        database.drizzle
          .insert(servicesTable)
          .values({
            serviceName: span.serviceName,
            lastSeenUnixNano: encodeSortableBigInt(span.endTimeUnixNano),
          })
          .onConflictDoUpdate({
            target: servicesTable.serviceName,
            set: {
              lastSeenUnixNano: encodeSortableBigInt(span.endTimeUnixNano),
            },
          })
          .run();

        database.drizzle
          .insert(operationsTable)
          .values({
            serviceName: span.serviceName,
            spanName: span.spanName,
            spanKind: span.spanKind,
            lastSeenUnixNano: encodeSortableBigInt(span.endTimeUnixNano),
          })
          .onConflictDoUpdate({
            target: [
              operationsTable.serviceName,
              operationsTable.spanName,
              operationsTable.spanKind,
            ],
            set: {
              lastSeenUnixNano: encodeSortableBigInt(span.endTimeUnixNano),
            },
          })
          .run();
      }

      deleteIndexedAttributes.run({ traceId: span.traceId, spanId: span.spanId });

      for (const [key, value] of Object.entries({
        ...span.resourceAttributes,
        ...span.spanAttributes,
      })) {
        if (!indexedAttributeKeys.includes(key)) {
          continue;
        }

        const flattenedValues = flattenAttributeValue(value);
        for (const flattenedValue of flattenedValues) {
          database.drizzle
            .insert(indexedAttributesTable)
            .values({
              traceId: span.traceId,
              spanId: span.spanId,
              key,
              value: flattenedValue,
            })
            .onConflictDoNothing()
            .run();
        }
      }
    }

    for (const traceId of uniqueTraceIds) {
      recomputeTraceSummary(database, traceId);
    }
  });

  transaction.immediate();
};

const recomputeTraceSummary = (database: CollectorDatabase, traceId: string): void => {
  const rows = database.drizzle
    .select()
    .from(spansTable)
    .where(eq(spansTable.traceId, traceId))
    .orderBy(desc(spansTable.startTimeUnixNano))
    .all();

  if (rows.length === 0) {
    database.drizzle.delete(tracesTable).where(eq(tracesTable.traceId, traceId)).run();
    return;
  }

  const spans = rows.map((row) => ({
    traceId: row.traceId,
    spanId: row.spanId,
    parentSpanId: row.parentSpanId,
    serviceName: row.serviceName,
    spanName: row.spanName,
    spanKind: row.spanKind,
    startTimeUnixNano: decodeSortableBigInt(row.startTimeUnixNano),
    endTimeUnixNano: decodeSortableBigInt(row.endTimeUnixNano),
    durationNano: decodeSortableBigInt(row.durationNano),
    statusCode: row.statusCode,
    statusMessage: row.statusMessage,
    traceState: row.traceState,
    resourceAttributes: jsonParseRecord(row.resourceAttributesJson),
    spanAttributes: jsonParseRecord(row.spanAttributesJson),
    events: jsonParseEvents(row.eventsJson),
    links: jsonParseLinks(row.linksJson),
    instrumentationScopeName: row.instrumentationScopeName,
    instrumentationScopeVersion: row.instrumentationScopeVersion,
    droppedAttributesCount: row.droppedAttributesCount,
    droppedEventsCount: row.droppedEventsCount,
    droppedLinksCount: row.droppedLinksCount,
  }));

  const spanIds = new Set(spans.map((span) => span.spanId));
  const roots = spans
    .filter((span) => !span.parentSpanId || !spanIds.has(span.parentSpanId))
    .sort((left, right) => Number(left.startTimeUnixNano - right.startTimeUnixNano));
  const sortedByStart = [...spans].sort((left, right) =>
    Number(left.startTimeUnixNano - right.startTimeUnixNano),
  );
  const rootSpan = roots[0] ?? sortedByStart[0];
  const startTimeUnixNano = sortedByStart.reduce(
    (current, span) => (span.startTimeUnixNano < current ? span.startTimeUnixNano : current),
    sortedByStart[0]?.startTimeUnixNano ?? 0n,
  );
  const endTimeUnixNano = sortedByStart.reduce(
    (current, span) => (span.endTimeUnixNano > current ? span.endTimeUnixNano : current),
    sortedByStart[0]?.endTimeUnixNano ?? 0n,
  );
  const durationNano =
    endTimeUnixNano >= startTimeUnixNano ? endTimeUnixNano - startTimeUnixNano : 0n;
  const serviceCount = new Set(
    spans.flatMap((span) => (span.serviceName ? [span.serviceName] : [])),
  ).size;
  const errorCount = spans.filter((span) => span.statusCode === "error").length;
  const updatedAtUnixNano = spans.reduce(
    (current, span) => (span.endTimeUnixNano > current ? span.endTimeUnixNano : current),
    0n,
  );

  database.drizzle
    .insert(tracesTable)
    .values({
      traceId,
      rootServiceName: rootSpan?.serviceName ?? null,
      rootSpanName: rootSpan?.spanName ?? null,
      startTimeUnixNano: encodeSortableBigInt(startTimeUnixNano),
      endTimeUnixNano: encodeSortableBigInt(endTimeUnixNano),
      durationNano: encodeSortableBigInt(durationNano),
      spanCount: spans.length,
      errorCount,
      serviceCount,
      updatedAtUnixNano: encodeSortableBigInt(updatedAtUnixNano),
    })
    .onConflictDoUpdate({
      target: tracesTable.traceId,
      set: {
        rootServiceName: rootSpan?.serviceName ?? null,
        rootSpanName: rootSpan?.spanName ?? null,
        startTimeUnixNano: encodeSortableBigInt(startTimeUnixNano),
        endTimeUnixNano: encodeSortableBigInt(endTimeUnixNano),
        durationNano: encodeSortableBigInt(durationNano),
        spanCount: spans.length,
        errorCount,
        serviceCount,
        updatedAtUnixNano: encodeSortableBigInt(updatedAtUnixNano),
      },
    })
    .run();
};

const flattenAttributeValue = (value: AttributeValue): string[] => {
  if (value === null) {
    return ["null"];
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenAttributeValue(item));
  }

  return [JSON.stringify(value)];
};
