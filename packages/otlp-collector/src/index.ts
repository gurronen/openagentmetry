export { DEFAULT_HOST, DEFAULT_PORT, DEFAULT_SEARCH_LOOKBACK_MS } from "./config";
export { startCollector, parseCollectorCliOptions } from "./server";
export type {
  CollectorHandle,
  CollectorOptions,
  SearchFilters,
  TraceDetails,
  TraceSummary,
} from "./types";
