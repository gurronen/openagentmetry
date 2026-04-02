import { decodeProtobufExportRequest, encodeProtobufExportResponse } from "./proto";
import { normalizeJsonExport, normalizeProtoExport } from "./normalize";
import { storeNormalizedSpans } from "./db/write";
import type { CollectorDatabase } from "./db/client";
import type { PartialSuccessResult } from "./types";

type BodyFormat = "json" | "protobuf";

export const handleTracesRequest = async (
  request: Request,
  database: CollectorDatabase,
  indexedAttributeKeys: readonly string[],
): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  if (request.method !== "POST") {
    return withCors(new Response("Method not allowed", { status: 405 }));
  }

  const bodyFormat = getBodyFormat(request.headers.get("content-type"));
  if (!bodyFormat) {
    return withCors(new Response("Unsupported content type", { status: 415 }));
  }

  try {
    const body = await readRequestBytes(request);
    const normalized =
      bodyFormat === "protobuf"
        ? normalizeProtoExport(decodeProtobufExportRequest(body) as Record<string, unknown>)
        : normalizeJsonExport(
            JSON.parse(Buffer.from(body).toString("utf8")) as Record<string, unknown>,
          );

    storeNormalizedSpans(database, normalized.spans, indexedAttributeKeys);
    return createExportResponse(bodyFormat, normalized.partialSuccess);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid OTLP payload";
    return withCors(new Response(message, { status: 400 }));
  }
};

const createExportResponse = (
  format: BodyFormat,
  partialSuccess?: PartialSuccessResult,
): Response => {
  if (format === "protobuf") {
    return withCors(
      new Response(encodeProtobufExportResponse(partialSuccess), {
        status: 200,
        headers: {
          "content-type": "application/x-protobuf",
        },
      }),
    );
  }

  return withCors(
    new Response(
      JSON.stringify(
        partialSuccess
          ? {
              partialSuccess: {
                rejectedSpans: partialSuccess.rejectedSpans,
                errorMessage: partialSuccess.errorMessage ?? "",
              },
            }
          : {},
      ),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    ),
  );
};

const getBodyFormat = (contentType: string | null): BodyFormat | null => {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "application/json") {
    return "json";
  }
  if (normalized === "application/x-protobuf") {
    return "protobuf";
  }
  return null;
};

const readRequestBytes = async (request: Request): Promise<Uint8Array> => {
  if (!request.body) {
    return new Uint8Array();
  }

  const encoding = request.headers.get("content-encoding")?.toLowerCase();
  if (encoding === "gzip") {
    const decompressed = request.body.pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(decompressed).arrayBuffer());
  }

  return new Uint8Array(await request.arrayBuffer());
};

const withCors = (response: Response): Response => {
  response.headers.set("access-control-allow-origin", "*");
  response.headers.set("access-control-allow-methods", "POST, OPTIONS");
  response.headers.set("access-control-allow-headers", "content-type, content-encoding");
  return response;
};
