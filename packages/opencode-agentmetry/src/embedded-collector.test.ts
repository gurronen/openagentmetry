import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  __resetEmbeddedCollectorForTests,
  getEmbeddedCollectorState,
  startEmbeddedCollectorOnce,
} from "./embedded-collector";

const createDbPath = (): string =>
  join(mkdtempSync(join(tmpdir(), "openagentmetry-collector-")), "traces.sqlite");

afterEach(() => {
  __resetEmbeddedCollectorForTests();
});

describe("embedded collector", () => {
  test("starts once and exposes localhost URLs", () => {
    const runtime = startEmbeddedCollectorOnce({
      dbPath: createDbPath(),
      host: "0.0.0.0",
      port: 0,
    });

    expect(runtime.collectorUrl).toStartWith("http://127.0.0.1:");
    expect(runtime.otlpTracesUrl).toBe(`${runtime.collectorUrl}/v1/traces`);
    expect(runtime.uiUrl).toBe(`${runtime.collectorUrl}/`);
    expect(runtime.bindHost).toBe("0.0.0.0");
    expect(runtime.actualPort).toBeGreaterThan(0);
  });

  test("reuses the same collector singleton", () => {
    const first = startEmbeddedCollectorOnce({
      dbPath: createDbPath(),
      host: "0.0.0.0",
      port: 0,
    });
    const second = startEmbeddedCollectorOnce({
      dbPath: createDbPath(),
      host: "0.0.0.0",
      port: 4318,
    });

    expect(second).toBe(first);
    expect(getEmbeddedCollectorState()).toBe(first);
  });

  test("falls back to a random port when the requested port is busy", () => {
    const occupied = Bun.serve({
      hostname: "0.0.0.0",
      port: 4318,
      fetch: () => new Response("occupied"),
    });

    try {
      const runtime = startEmbeddedCollectorOnce({
        dbPath: createDbPath(),
        host: "0.0.0.0",
        port: 4318,
      });

      expect(runtime.requestedPort).toBe(4318);
      expect(runtime.actualPort).not.toBe(4318);
      expect(runtime.collectorUrl).toContain(`:${runtime.actualPort}`);
    } finally {
      occupied.stop(true);
    }
  });
});
