import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { CollectorDatabase } from "./client";
import { indexedAttributesTable, operationsTable, spansTable, tracesTable } from "./schema";
import {
  decodeSortableBigInt,
  jsonParseEvents,
  jsonParseLinks,
  jsonParseRecord,
} from "../normalize";
import type { SearchFilters, TraceDetails, TraceSpan, TraceSummary } from "../types";

export const listServices = (database: CollectorDatabase): string[] => {
  const rows = database.sqlite
    .query("SELECT service_name FROM services ORDER BY service_name ASC")
    .all() as {
    service_name: string;
  }[];
  return rows.map((row) => row.service_name);
};

export const listOperations = (
  database: CollectorDatabase,
  serviceName: string,
): { name: string; kind: string }[] =>
  database.drizzle
    .select({ name: operationsTable.spanName, kind: operationsTable.spanKind })
    .from(operationsTable)
    .where(eq(operationsTable.serviceName, serviceName))
    .all()
    .sort((left, right) => left.name.localeCompare(right.name));

export const searchTraceSummaries = (
  database: CollectorDatabase,
  filters: SearchFilters,
): TraceSummary[] => {
  const conditions = [];

  if (filters.traceId) {
    conditions.push(eq(tracesTable.traceId, filters.traceId));
  }

  if (filters.start !== undefined) {
    conditions.push(gte(tracesTable.startTimeUnixNano, filters.start.toString().padStart(20, "0")));
  }

  if (filters.end !== undefined) {
    conditions.push(lte(tracesTable.startTimeUnixNano, filters.end.toString().padStart(20, "0")));
  }

  if (filters.minDuration !== undefined) {
    conditions.push(
      gte(tracesTable.durationNano, filters.minDuration.toString().padStart(20, "0")),
    );
  }

  if (filters.maxDuration !== undefined) {
    conditions.push(
      lte(tracesTable.durationNano, filters.maxDuration.toString().padStart(20, "0")),
    );
  }

  let traceIdCandidates: string[] | null = null;

  if (filters.service) {
    const serviceTraceIds = database.drizzle
      .select({ traceId: spansTable.traceId })
      .from(spansTable)
      .where(eq(spansTable.serviceName, filters.service))
      .all()
      .map((row) => row.traceId);

    traceIdCandidates = dedupe(serviceTraceIds);
  }

  if (filters.operation) {
    const operationTraceIds = database.drizzle
      .select({ traceId: spansTable.traceId })
      .from(spansTable)
      .where(
        and(
          eq(spansTable.spanName, filters.operation),
          filters.service ? eq(spansTable.serviceName, filters.service) : undefined,
        ),
      )
      .all()
      .map((row) => row.traceId);

    traceIdCandidates = dedupe(operationTraceIds);
  }

  for (const [key, value] of Object.entries(filters.attributes)) {
    const matches = database.drizzle
      .select({ traceId: indexedAttributesTable.traceId })
      .from(indexedAttributesTable)
      .where(and(eq(indexedAttributesTable.key, key), eq(indexedAttributesTable.value, value)))
      .all()
      .map((row) => row.traceId);

    traceIdCandidates = traceIdCandidates ? intersect(traceIdCandidates, matches) : dedupe(matches);
  }

  if (traceIdCandidates && traceIdCandidates.length === 0) {
    return [];
  }

  if (traceIdCandidates) {
    conditions.push(inArray(tracesTable.traceId, traceIdCandidates));
  }

  const rows = database.drizzle
    .select()
    .from(tracesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tracesTable.startTimeUnixNano))
    .limit(filters.limit)
    .all();

  return rows.map((row) => ({
    traceId: row.traceId,
    rootServiceName: row.rootServiceName,
    rootSpanName: row.rootSpanName,
    startTimeUnixNano: decodeSortableBigInt(row.startTimeUnixNano),
    endTimeUnixNano: decodeSortableBigInt(row.endTimeUnixNano),
    durationNano: decodeSortableBigInt(row.durationNano),
    spanCount: row.spanCount,
    errorCount: row.errorCount,
    serviceCount: row.serviceCount,
    updatedAtUnixNano: decodeSortableBigInt(row.updatedAtUnixNano),
  }));
};

export const getTraceDetails = (
  database: CollectorDatabase,
  traceId: string,
): TraceDetails | null => {
  const summaryRow = database.drizzle
    .select()
    .from(tracesTable)
    .where(eq(tracesTable.traceId, traceId))
    .get();
  if (!summaryRow) {
    return null;
  }

  const spansRows = database.drizzle
    .select()
    .from(spansTable)
    .where(eq(spansTable.traceId, traceId))
    .orderBy(spansTable.startTimeUnixNano)
    .all();

  const spans: TraceSpan[] = spansRows.map((row) => ({
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

  return {
    summary: {
      traceId: summaryRow.traceId,
      rootServiceName: summaryRow.rootServiceName,
      rootSpanName: summaryRow.rootSpanName,
      startTimeUnixNano: decodeSortableBigInt(summaryRow.startTimeUnixNano),
      endTimeUnixNano: decodeSortableBigInt(summaryRow.endTimeUnixNano),
      durationNano: decodeSortableBigInt(summaryRow.durationNano),
      spanCount: summaryRow.spanCount,
      errorCount: summaryRow.errorCount,
      serviceCount: summaryRow.serviceCount,
      updatedAtUnixNano: decodeSortableBigInt(summaryRow.updatedAtUnixNano),
    },
    spans,
  };
};

const dedupe = (values: string[]): string[] => [...new Set(values)];

const intersect = (left: string[], right: string[]): string[] => {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
};
