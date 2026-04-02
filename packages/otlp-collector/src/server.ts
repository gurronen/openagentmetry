import { parseArgs } from "node:util";
import { resolveCollectorConfig, type ResolvedCollectorConfig, expandHomePath } from "./config";
import { openCollectorDatabase } from "./db/client";
import { migrateCollectorDatabase } from "./db/migrate";
import { getTraceDetails, listOperations, listServices, searchTraceSummaries } from "./db/query";
import { handleTracesRequest } from "./otlp-http";
import { renderAppHtml, appScript, appStyles } from "./ui";
import type { CollectorHandle, CollectorOptions, SearchFilters } from "./types";

interface RunningCollector extends CollectorHandle {
  server: ReturnType<typeof Bun.serve>;
}

export const startCollector = (options: CollectorOptions = {}): RunningCollector => {
  const config = resolveCollectorConfig({
    ...options,
    dbPath: options.dbPath ? expandHomePath(options.dbPath) : options.dbPath,
  });
  const database = openCollectorDatabase(config.dbPath);
  migrateCollectorDatabase(database);

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: async (request) => routeRequest(request, config, database),
  });

  return {
    server,
    host: config.host,
    port: server.port ?? config.port,
    dbPath: config.dbPath,
    stop: () => {
      server.stop(true);
      database.sqlite.close(false);
    },
  };
};

const routeRequest = async (
  request: Request,
  config: ResolvedCollectorConfig,
  database: ReturnType<typeof openCollectorDatabase>,
): Promise<Response> => {
  const url = new URL(request.url);

  if (url.pathname === "/v1/traces") {
    return handleTracesRequest(request, database, config.indexedAttributeKeys);
  }

  if (url.pathname === "/styles.css") {
    return new Response(appStyles, { headers: { "content-type": "text/css; charset=utf-8" } });
  }

  if (url.pathname === "/app.js") {
    return new Response(appScript, {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  }

  if (url.pathname === "/") {
    return new Response(renderAppHtml(config), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname === "/api/services") {
    return Response.json(listServices(database));
  }

  if (url.pathname === "/api/operations") {
    const service = url.searchParams.get("service") ?? "";
    return Response.json(service ? listOperations(database, service) : []);
  }

  if (url.pathname === "/api/traces") {
    return Response.json(
      serializeJson(searchTraceSummaries(database, buildSearchFilters(url.searchParams))),
    );
  }

  if (url.pathname.startsWith("/api/traces/")) {
    const traceId = decodeURIComponent(url.pathname.slice("/api/traces/".length));
    const trace = getTraceDetails(database, traceId);
    return trace ? Response.json(serializeJson(trace)) : new Response("Not found", { status: 404 });
  }

  return new Response("Not found", { status: 404 });
};

const buildSearchFilters = (params: URLSearchParams): SearchFilters => {
  const attributes: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith("attr.")) {
      attributes[key.slice(5)] = value;
    }
  }

  const limit = Number(params.get("limit") ?? "50");
  const minDurationMs = params.get("minDurationMs");
  const maxDurationMs = params.get("maxDurationMs");

  return {
    service: emptyToUndefined(params.get("service")),
    operation: emptyToUndefined(params.get("operation")),
    traceId: emptyToUndefined(params.get("traceId"))?.toLowerCase(),
    start: parseDateNano(params.get("start")),
    end: parseDateNano(params.get("end")),
    minDuration: minDurationMs ? BigInt(minDurationMs) * 1000000n : undefined,
    maxDuration: maxDurationMs ? BigInt(maxDurationMs) * 1000000n : undefined,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
    attributes,
  };
};

const parseDateNano = (value: string | null): bigint | undefined => {
  if (!value) {
    return undefined;
  }

  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? BigInt(milliseconds) * 1000000n : undefined;
};

const emptyToUndefined = (value: string | null): string | undefined =>
  value && value.length > 0 ? value : undefined;

const serializeJson = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, entry) => {
      if (typeof entry === "bigint") {
        return entry.toString();
      }

      return entry;
    }),
  );

export const parseCollectorCliOptions = (argv: string[]): CollectorOptions => {
  const parsed = parseArgs({
    args: argv,
    options: {
      host: { type: "string" },
      port: { type: "string" },
      db: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  return {
    host: parsed.values.host,
    port: parsed.values.port ? Number(parsed.values.port) : undefined,
    dbPath: parsed.values.db,
  };
};
