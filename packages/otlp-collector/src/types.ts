export interface CollectorOptions {
  dbPath?: string;
  host?: string;
  port?: number;
  defaultSearchLookbackMs?: number;
  indexedAttributeKeys?: readonly string[];
}

export interface SearchFilters {
  service?: string;
  operation?: string;
  traceId?: string;
  start?: bigint;
  end?: bigint;
  minDuration?: bigint;
  maxDuration?: bigint;
  limit: number;
  attributes: Record<string, string>;
}

export interface TraceSummary {
  traceId: string;
  rootServiceName: string | null;
  rootSpanName: string | null;
  startTimeUnixNano: bigint;
  endTimeUnixNano: bigint;
  durationNano: bigint;
  spanCount: number;
  errorCount: number;
  serviceCount: number;
  updatedAtUnixNano: bigint;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  serviceName: string | null;
  spanName: string;
  spanKind: string;
  startTimeUnixNano: bigint;
  endTimeUnixNano: bigint;
  durationNano: bigint;
  statusCode: string;
  statusMessage: string | null;
  traceState: string | null;
  resourceAttributes: Record<string, AttributeValue>;
  spanAttributes: Record<string, AttributeValue>;
  events: SpanEvent[];
  links: SpanLink[];
  instrumentationScopeName: string | null;
  instrumentationScopeVersion: string | null;
  droppedAttributesCount: number;
  droppedEventsCount: number;
  droppedLinksCount: number;
}

export interface TraceDetails {
  summary: TraceSummary;
  spans: TraceSpan[];
}

export interface AttributeMap {
  [key: string]: AttributeValue;
}

export type AttributeValue = string | number | boolean | null | AttributeValue[] | AttributeMap;

export interface SpanEvent {
  timeUnixNano: string;
  name: string;
  attributes: AttributeMap;
  droppedAttributesCount: number;
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  traceState: string | null;
  attributes: AttributeMap;
  droppedAttributesCount: number;
}

export interface NormalizedSpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  serviceName: string | null;
  spanName: string;
  spanKind: string;
  startTimeUnixNano: bigint;
  endTimeUnixNano: bigint;
  durationNano: bigint;
  statusCode: string;
  statusMessage: string | null;
  traceState: string | null;
  resourceAttributes: AttributeMap;
  spanAttributes: AttributeMap;
  events: SpanEvent[];
  links: SpanLink[];
  instrumentationScopeName: string | null;
  instrumentationScopeVersion: string | null;
  droppedAttributesCount: number;
  droppedEventsCount: number;
  droppedLinksCount: number;
}

export interface PartialSuccessResult {
  rejectedSpans: number;
  errorMessage?: string;
}

export interface CollectorHandle {
  readonly port: number;
  readonly host: string;
  readonly dbPath: string;
  stop: () => void;
}
