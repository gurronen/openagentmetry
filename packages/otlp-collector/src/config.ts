import { homedir } from "node:os";
import { resolve } from "node:path";
import type { CollectorOptions } from "./types";

export const DEFAULT_PORT = 4318;
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_SEARCH_LOOKBACK_MS = 60 * 60 * 1000;
const DEFAULT_INDEXED_ATTRIBUTE_KEYS = [
  "service.name",
  "ai.agent.id",
  "ai.agent.name",
  "ai.session.id",
  "ai.session.name",
  "ai.tool.name",
  "ai.tool.execution_id",
  "ai.message.id",
  "ai.message.role",
  "ai.model.name",
  "ai.tokens.total",
  "ai.permission.name",
  "ai.permission.decision",
  "ai.file.path",
] as const;

export interface ResolvedCollectorConfig {
  dbPath: string;
  host: string;
  port: number;
  defaultSearchLookbackMs: number;
  indexedAttributeKeys: string[];
}

export const resolveCollectorConfig = (
  options: CollectorOptions = {},
): ResolvedCollectorConfig => ({
  dbPath: resolve(options.dbPath ?? ".openagentmetry/traces.db"),
  host: options.host ?? DEFAULT_HOST,
  port: options.port ?? DEFAULT_PORT,
  defaultSearchLookbackMs: options.defaultSearchLookbackMs ?? DEFAULT_SEARCH_LOOKBACK_MS,
  indexedAttributeKeys: [...(options.indexedAttributeKeys ?? DEFAULT_INDEXED_ATTRIBUTE_KEYS)],
});

export const expandHomePath = (input: string): string => {
  if (!input.startsWith("~/")) {
    return input;
  }

  return resolve(homedir(), input.slice(2));
};
