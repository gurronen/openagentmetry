import type {
  AttributeMap,
  AttributeValue,
  NormalizedSpanRecord,
  PartialSuccessResult,
  SpanEvent,
  SpanLink,
} from "./types";

interface ProtoExportRequest {
  resource_spans?: ProtoResourceSpans[];
}

interface ProtoResourceSpans {
  resource?: ProtoResource;
  scope_spans?: ProtoScopeSpans[];
}

interface ProtoResource {
  attributes?: ProtoKeyValue[];
}

interface ProtoScopeSpans {
  scope?: ProtoInstrumentationScope;
  spans?: ProtoSpan[];
}

interface ProtoInstrumentationScope {
  name?: string;
  version?: string;
}

interface ProtoSpan {
  trace_id?: Uint8Array;
  span_id?: Uint8Array;
  parent_span_id?: Uint8Array;
  trace_state?: string;
  name?: string;
  kind?: number;
  start_time_unix_nano?: unknown;
  end_time_unix_nano?: unknown;
  attributes?: ProtoKeyValue[];
  dropped_attributes_count?: number;
  events?: ProtoEvent[];
  dropped_events_count?: number;
  links?: ProtoLink[];
  dropped_links_count?: number;
  status?: ProtoStatus;
}

interface ProtoEvent {
  time_unix_nano?: unknown;
  name?: string;
  attributes?: ProtoKeyValue[];
  dropped_attributes_count?: number;
}

interface ProtoLink {
  trace_id?: Uint8Array;
  span_id?: Uint8Array;
  trace_state?: string;
  attributes?: ProtoKeyValue[];
  dropped_attributes_count?: number;
}

interface ProtoStatus {
  code?: number;
  message?: string;
}

interface ProtoKeyValue {
  key?: string;
  value?: ProtoAnyValue;
}

interface ProtoAnyValue {
  string_value?: string;
  bool_value?: boolean;
  int_value?: unknown;
  double_value?: number;
  array_value?: { values?: ProtoAnyValue[] };
  kvlist_value?: { values?: ProtoKeyValue[] };
  bytes_value?: Uint8Array;
}

interface JsonExportRequest {
  resourceSpans?: JsonResourceSpans[];
}

interface JsonResourceSpans {
  resource?: JsonResource;
  scopeSpans?: JsonScopeSpans[];
}

interface JsonResource {
  attributes?: JsonKeyValue[];
}

interface JsonScopeSpans {
  scope?: JsonInstrumentationScope;
  spans?: JsonSpan[];
}

interface JsonInstrumentationScope {
  name?: string;
  version?: string;
}

interface JsonSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  traceState?: string;
  name?: string;
  kind?: number | string;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: JsonKeyValue[];
  droppedAttributesCount?: number;
  events?: JsonEvent[];
  droppedEventsCount?: number;
  links?: JsonLink[];
  droppedLinksCount?: number;
  status?: JsonStatus;
}

interface JsonEvent {
  timeUnixNano?: string | number;
  name?: string;
  attributes?: JsonKeyValue[];
  droppedAttributesCount?: number;
}

interface JsonLink {
  traceId?: string;
  spanId?: string;
  traceState?: string;
  attributes?: JsonKeyValue[];
  droppedAttributesCount?: number;
}

interface JsonStatus {
  code?: number | string;
  message?: string;
}

interface JsonKeyValue {
  key?: string;
  value?: JsonAnyValue;
}

interface JsonAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: { values?: JsonAnyValue[] };
  kvlistValue?: { values?: JsonKeyValue[] };
  bytesValue?: string;
}

const SPAN_KIND_NAMES = [
  "unspecified",
  "internal",
  "server",
  "client",
  "producer",
  "consumer",
] as const;
const STATUS_CODE_NAMES = ["unset", "ok", "error"] as const;

export const normalizeProtoExport = (
  input: ProtoExportRequest,
): { spans: NormalizedSpanRecord[]; partialSuccess?: PartialSuccessResult } => {
  const spans: NormalizedSpanRecord[] = [];
  let rejectedSpans = 0;

  for (const resourceSpans of input.resource_spans ?? []) {
    const resourceAttributes = protoAttributesToRecord(resourceSpans.resource?.attributes ?? []);
    const serviceName = stringOrNull(resourceAttributes["service.name"]);

    for (const scopeSpans of resourceSpans.scope_spans ?? []) {
      for (const span of scopeSpans.spans ?? []) {
        const normalized = normalizeProtoSpan(span, {
          resourceAttributes,
          serviceName,
          scopeName: scopeSpans.scope?.name ?? null,
          scopeVersion: scopeSpans.scope?.version ?? null,
        });

        if (!normalized) {
          rejectedSpans += 1;
          continue;
        }

        spans.push(normalized);
      }
    }
  }

  return {
    spans,
    partialSuccess:
      rejectedSpans > 0
        ? { rejectedSpans, errorMessage: "Some spans were missing required identifiers." }
        : undefined,
  };
};

export const normalizeJsonExport = (
  input: JsonExportRequest,
): { spans: NormalizedSpanRecord[]; partialSuccess?: PartialSuccessResult } => {
  const spans: NormalizedSpanRecord[] = [];
  let rejectedSpans = 0;

  for (const resourceSpans of input.resourceSpans ?? []) {
    const resourceAttributes = jsonAttributesToRecord(resourceSpans.resource?.attributes ?? []);
    const serviceName = stringOrNull(resourceAttributes["service.name"]);

    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      for (const span of scopeSpans.spans ?? []) {
        const normalized = normalizeJsonSpan(span, {
          resourceAttributes,
          serviceName,
          scopeName: scopeSpans.scope?.name ?? null,
          scopeVersion: scopeSpans.scope?.version ?? null,
        });

        if (!normalized) {
          rejectedSpans += 1;
          continue;
        }

        spans.push(normalized);
      }
    }
  }

  return {
    spans,
    partialSuccess:
      rejectedSpans > 0
        ? { rejectedSpans, errorMessage: "Some spans were missing required identifiers." }
        : undefined,
  };
};

const normalizeProtoSpan = (
  span: ProtoSpan,
  context: {
    resourceAttributes: AttributeMap;
    serviceName: string | null;
    scopeName: string | null;
    scopeVersion: string | null;
  },
): NormalizedSpanRecord | null => {
  const traceId = bytesToHex(span.trace_id, 16);
  const spanId = bytesToHex(span.span_id, 8);

  if (!traceId || !spanId) {
    return null;
  }

  const parentSpanId = bytesToHex(span.parent_span_id, 8);
  const start = toBigInt(span.start_time_unix_nano);
  const end = toBigInt(span.end_time_unix_nano);
  const spanAttributes = protoAttributesToRecord(span.attributes ?? []);

  return {
    traceId,
    spanId,
    parentSpanId,
    serviceName: context.serviceName,
    spanName: span.name ?? "unnamed-span",
    spanKind: SPAN_KIND_NAMES[span.kind ?? 0] ?? "unspecified",
    startTimeUnixNano: start,
    endTimeUnixNano: end,
    durationNano: end >= start ? end - start : 0n,
    statusCode: STATUS_CODE_NAMES[span.status?.code ?? 0] ?? "unset",
    statusMessage: span.status?.message ?? null,
    traceState: span.trace_state ?? null,
    resourceAttributes: context.resourceAttributes,
    spanAttributes,
    events: (span.events ?? []).map((event) => normalizeProtoEvent(event)),
    links: (span.links ?? []).map((link) => normalizeProtoLink(link)),
    instrumentationScopeName: context.scopeName,
    instrumentationScopeVersion: context.scopeVersion,
    droppedAttributesCount: span.dropped_attributes_count ?? 0,
    droppedEventsCount: span.dropped_events_count ?? 0,
    droppedLinksCount: span.dropped_links_count ?? 0,
  };
};

const normalizeJsonSpan = (
  span: JsonSpan,
  context: {
    resourceAttributes: AttributeMap;
    serviceName: string | null;
    scopeName: string | null;
    scopeVersion: string | null;
  },
): NormalizedSpanRecord | null => {
  const traceId = normalizeHex(span.traceId, 16);
  const spanId = normalizeHex(span.spanId, 8);

  if (!traceId || !spanId) {
    return null;
  }

  const parentSpanId = normalizeHex(span.parentSpanId, 8);
  const start = toBigInt(span.startTimeUnixNano);
  const end = toBigInt(span.endTimeUnixNano);
  const spanAttributes = jsonAttributesToRecord(span.attributes ?? []);

  return {
    traceId,
    spanId,
    parentSpanId,
    serviceName: context.serviceName,
    spanName: span.name ?? "unnamed-span",
    spanKind: normalizeSpanKind(span.kind),
    startTimeUnixNano: start,
    endTimeUnixNano: end,
    durationNano: end >= start ? end - start : 0n,
    statusCode: normalizeStatusCode(span.status?.code),
    statusMessage: span.status?.message ?? null,
    traceState: span.traceState ?? null,
    resourceAttributes: context.resourceAttributes,
    spanAttributes,
    events: (span.events ?? []).map((event) => normalizeJsonEvent(event)),
    links: (span.links ?? []).map((link) => normalizeJsonLink(link)),
    instrumentationScopeName: context.scopeName,
    instrumentationScopeVersion: context.scopeVersion,
    droppedAttributesCount: span.droppedAttributesCount ?? 0,
    droppedEventsCount: span.droppedEventsCount ?? 0,
    droppedLinksCount: span.droppedLinksCount ?? 0,
  };
};

const normalizeProtoEvent = (event: ProtoEvent): SpanEvent => ({
  timeUnixNano: toBigInt(event.time_unix_nano).toString(),
  name: event.name ?? "event",
  attributes: protoAttributesToRecord(event.attributes ?? []),
  droppedAttributesCount: event.dropped_attributes_count ?? 0,
});

const normalizeJsonEvent = (event: JsonEvent): SpanEvent => ({
  timeUnixNano: toBigInt(event.timeUnixNano).toString(),
  name: event.name ?? "event",
  attributes: jsonAttributesToRecord(event.attributes ?? []),
  droppedAttributesCount: event.droppedAttributesCount ?? 0,
});

const normalizeProtoLink = (link: ProtoLink): SpanLink => ({
  traceId: bytesToHex(link.trace_id, 16) ?? "",
  spanId: bytesToHex(link.span_id, 8) ?? "",
  traceState: link.trace_state ?? null,
  attributes: protoAttributesToRecord(link.attributes ?? []),
  droppedAttributesCount: link.dropped_attributes_count ?? 0,
});

const normalizeJsonLink = (link: JsonLink): SpanLink => ({
  traceId: normalizeHex(link.traceId, 16) ?? "",
  spanId: normalizeHex(link.spanId, 8) ?? "",
  traceState: link.traceState ?? null,
  attributes: jsonAttributesToRecord(link.attributes ?? []),
  droppedAttributesCount: link.droppedAttributesCount ?? 0,
});

const protoAttributesToRecord = (attributes: ProtoKeyValue[]): AttributeMap => {
  const output: AttributeMap = {};

  for (const attribute of attributes) {
    if (!attribute.key) {
      continue;
    }

    output[attribute.key] = protoAnyValueToAttribute(attribute.value);
  }

  return output;
};

const jsonAttributesToRecord = (attributes: JsonKeyValue[]): AttributeMap => {
  const output: AttributeMap = {};

  for (const attribute of attributes) {
    if (!attribute.key) {
      continue;
    }

    output[attribute.key] = jsonAnyValueToAttribute(attribute.value);
  }

  return output;
};

const protoAnyValueToAttribute = (value: ProtoAnyValue | undefined): AttributeValue => {
  if (!value) {
    return null;
  }

  if (value.string_value !== undefined) {
    return value.string_value;
  }

  if (value.bool_value !== undefined) {
    return value.bool_value;
  }

  if (value.int_value !== undefined) {
    return Number(toBigInt(value.int_value));
  }

  if (value.double_value !== undefined) {
    return value.double_value;
  }

  if (value.array_value) {
    return (value.array_value.values ?? []).map((item) => protoAnyValueToAttribute(item));
  }

  if (value.kvlist_value) {
    return protoAttributesToRecord(value.kvlist_value.values ?? []);
  }

  if (value.bytes_value) {
    return bytesToHex(value.bytes_value) ?? "";
  }

  return null;
};

const jsonAnyValueToAttribute = (value: JsonAnyValue | undefined): AttributeValue => {
  if (!value) {
    return null;
  }

  if (value.stringValue !== undefined) {
    return value.stringValue;
  }

  if (value.boolValue !== undefined) {
    return value.boolValue;
  }

  if (value.intValue !== undefined) {
    return Number(toBigInt(value.intValue));
  }

  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }

  if (value.arrayValue) {
    return (value.arrayValue.values ?? []).map((item) => jsonAnyValueToAttribute(item));
  }

  if (value.kvlistValue) {
    return jsonAttributesToRecord(value.kvlistValue.values ?? []);
  }

  if (value.bytesValue !== undefined) {
    return value.bytesValue;
  }

  return null;
};

const normalizeHex = (input: string | undefined, byteLength?: number): string | null => {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toLowerCase();
  if (!/^[0-9a-f]+$/u.test(normalized)) {
    return null;
  }

  if (byteLength !== undefined && normalized.length !== byteLength * 2) {
    return null;
  }

  return normalized;
};

const bytesToHex = (value: Uint8Array | undefined, byteLength?: number): string | null => {
  if (!value || value.length === 0) {
    return null;
  }

  if (byteLength !== undefined && value.length !== byteLength) {
    return null;
  }

  return Buffer.from(value).toString("hex");
};

const toBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
  }

  if (typeof value === "string") {
    return value.length > 0 ? BigInt(value) : 0n;
  }

  if (value && typeof value === "object" && "toString" in value) {
    const stringValue = String(value);
    return stringValue.length > 0 ? BigInt(stringValue) : 0n;
  }

  return 0n;
};

export const encodeSortableBigInt = (value: bigint): string => value.toString().padStart(20, "0");

export const decodeSortableBigInt = (value: string): bigint => BigInt(value || "0");

export const jsonStringify = (value: unknown): string => JSON.stringify(value);

export const jsonParseRecord = (value: string): AttributeMap => JSON.parse(value) as AttributeMap;

export const jsonParseEvents = (value: string): SpanEvent[] => JSON.parse(value) as SpanEvent[];

export const jsonParseLinks = (value: string): SpanLink[] => JSON.parse(value) as SpanLink[];

const normalizeSpanKind = (value: number | string | undefined): string => {
  if (typeof value === "string") {
    return value.toLowerCase().replace("span_kind_", "");
  }

  return SPAN_KIND_NAMES[value ?? 0] ?? "unspecified";
};

const normalizeStatusCode = (value: number | string | undefined): string => {
  if (typeof value === "string") {
    return value.toLowerCase().replace("status_code_", "");
  }

  return STATUS_CODE_NAMES[value ?? 0] ?? "unset";
};

const stringOrNull = (value: AttributeValue): string | null =>
  typeof value === "string" ? value : null;
