import { afterEach, describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCollector } from "./server";

const activeCollectors: ReturnType<typeof startCollector>[] = [];

afterEach(() => {
  while (activeCollectors.length > 0) {
    activeCollectors.pop()?.stop();
  }
});

const createCollector = () => {
  const dbPath = join(
    tmpdir(),
    `openagentmetry-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  const collector = startCollector({ port: 0, dbPath });
  activeCollectors.push(collector);
  return collector;
};

describe("otlp collector", () => {
  test("ingests OTLP JSON and exposes trace queries", async () => {
    const collector = createCollector();
    const baseUrl = `http://${collector.host}:${collector.port}`;

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "demo-service" } }],
          },
          scopeSpans: [
            {
              scope: { name: "test-scope", version: "1.0.0" },
              spans: [
                {
                  traceId: "1234567890abcdef1234567890abcdef",
                  spanId: "1234567890abcdef",
                  name: "root.span",
                  kind: 2,
                  startTimeUnixNano: "1710000000000000000",
                  endTimeUnixNano: "1710000001000000000",
                  attributes: [
                    { key: "ai.session.id", value: { stringValue: "session-1" } },
                    { key: "ai.tool.name", value: { stringValue: "read" } },
                  ],
                  status: { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await fetch(`${baseUrl}/v1/traces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);

    const services = (await fetch(`${baseUrl}/api/services`).then((result) =>
      result.json(),
    )) as string[];
    expect(services).toEqual(["demo-service"]);

    const traces = (await fetch(
      `${baseUrl}/api/traces?service=demo-service&attr.ai.session.id=session-1`,
    ).then((result) => result.json())) as Array<{ traceId: string; rootSpanName: string }>;
    expect(traces).toHaveLength(1);
    expect(traces[0].rootSpanName).toBe("root.span");

    const detail = (await fetch(`${baseUrl}/api/traces/${traces[0].traceId}`).then((result) =>
      result.json(),
    )) as {
      spans: Array<{ spanAttributes: Record<string, unknown> }>;
    };
    expect(detail.spans).toHaveLength(1);
    expect(detail.spans[0].spanAttributes["ai.tool.name"]).toBe("read");
  });

  test("accepts gzip encoded JSON payloads", async () => {
    const collector = createCollector();
    const baseUrl = `http://${collector.host}:${collector.port}`;

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "gzip-service" } }],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  spanId: "bbbbbbbbbbbbbbbb",
                  name: "gzip.span",
                  startTimeUnixNano: "1710000000000000000",
                  endTimeUnixNano: "1710000000100000000",
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await fetch(`${baseUrl}/v1/traces`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
      body: gzipSync(Buffer.from(JSON.stringify(payload))),
    });

    expect(response.status).toBe(200);

    const traces = (await fetch(`${baseUrl}/api/traces?service=gzip-service`).then((result) =>
      result.json(),
    )) as unknown[];
    expect(traces).toHaveLength(1);
  });
});
