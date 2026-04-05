import { afterEach, describe, expect, test } from "bun:test";
import { createOpencode } from "@opencode-ai/sdk";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface ShellToolPart {
  type: "tool";
  state: {
    status: string;
    output: string;
  };
}

interface ShellMessageData {
  info: {
    id: string;
  };
  parts: ShellToolPart[];
}

const createTempDir = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));

const waitFor = async <T>(callback: () => Promise<T>, predicate: (value: T) => boolean) => {
  const timeoutAt = Date.now() + 10000;

  while (Date.now() < timeoutAt) {
    const value = await callback();
    if (predicate(value)) {
      return value;
    }

    await Bun.sleep(200);
  }

  throw new Error("Timed out waiting for smoke-test condition");
};

const withEnv = async (
  values: Record<string, string | undefined>,
  callback: () => Promise<void>,
): Promise<void> => {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
  }
};

const activeServers: Array<{ close: () => void }> = [];

afterEach(() => {
  while (activeServers.length > 0) {
    activeServers.pop()?.close();
  }
});

describe("OpenCode smoke test", () => {
  test("loads the plugin and exports traces to the embedded collector", async () => {
    const worktree = createTempDir("openagentmetry-worktree-");
    const configDir = join(worktree, ".opencode", "plugins");
    const pluginSource = pathToFileURL(join(import.meta.dir, "index.ts")).href;
    const dbPath = join(createTempDir("openagentmetry-db-"), "traces.sqlite");

    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "openagentmetry.ts"),
      `export { OpenAgentmetryPlugin } from ${JSON.stringify(pluginSource)};\n`,
    );

    await withEnv(
      {
        OPENAGENTMETRY_OTLP_URL: undefined,
        OPENAGENTMETRY_OTLP_ENABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_DISABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_PORT: "0",
        OPENAGENTMETRY_COLLECTOR_DB_PATH: dbPath,
        OPENAGENTMETRY_FORCE_FLUSH: "true",
      },
      async () => {
        const opencode = await createOpencode({
          config: {
            permission: {
              edit: "allow",
              bash: "allow",
              webfetch: "allow",
              doom_loop: "allow",
              external_directory: "allow",
            },
          },
        });
        activeServers.push(opencode.server);

        const session = await opencode.client.session.create({
          query: { directory: worktree },
        });
        const sessionData = session.data;

        expect(sessionData).toBeDefined();
        if (!sessionData) {
          throw new Error("session.create returned no session data");
        }

        await opencode.client.session.update({
          path: { id: sessionData.id },
          query: { directory: worktree },
          body: { title: "smoke-session" },
        });

        const agents = await opencode.client.app.agents({
          query: { directory: worktree },
        });
        const agentList = agents.data;

        expect(agentList).toBeDefined();
        if (!agentList || agentList.length === 0) {
          throw new Error("app.agents returned no agents");
        }

        const agent = agentList.find((entry) => entry.builtIn) ?? agentList[0];
        const shellMessage = await opencode.client.session.shell({
          path: { id: sessionData.id },
          query: { directory: worktree },
          body: {
            agent: agent.name,
            command: "env | grep '^OPENAGENTMETRY_ACTIVE_' | sort",
          },
        });
        const shellData = shellMessage.data as ShellMessageData | undefined;

        expect(shellData).toBeDefined();
        if (!shellData) {
          throw new Error("session.shell returned no message data");
        }

        const toolPart = shellData.parts.find(
          (part: ShellToolPart) => part.type === "tool" && part.state.status === "completed",
        );

        expect(toolPart).toBeDefined();
        expect(toolPart?.state.output).toContain("OPENAGENTMETRY_ACTIVE_OTLP_URL=");

        const lines =
          toolPart?.state.output.split("\n").filter((value: string) => value.length > 0) ?? [];
        expect(lines).toHaveLength(3);

        const collectorUrl =
          lines
            .find((value: string) => value.startsWith("OPENAGENTMETRY_ACTIVE_COLLECTOR_URL="))
            ?.split("=")[1] ?? "";

        expect(collectorUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
        const traces = await waitFor(
          async () =>
            (await fetch(`${collectorUrl}/api/traces`)).json() as Promise<
              Array<{ traceId: string; rootSpanName: string; rootServiceName: string | null }>
            >,
          (result) => result.length > 0,
        );

        expect(traces.some((trace) => trace.rootSpanName === "session.created")).toBeTrue();

        const detailsResponse = await fetch(`${collectorUrl}/api/traces/${traces[0].traceId}`);
        const traceDetails = (await detailsResponse.json()) as {
          spans: Array<{
            spanAttributes: Record<string, unknown>;
            resourceAttributes: Record<string, unknown>;
          }>;
        };

        expect(traceDetails.spans.length).toBeGreaterThan(0);
        expect(
          traceDetails.spans.some(
            (span) =>
              typeof span.resourceAttributes["service.name"] === "string" ||
              typeof span.spanAttributes["ai.session.id"] === "string",
          ),
        ).toBeTrue();
      },
    );
  });
});
