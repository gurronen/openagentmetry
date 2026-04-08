import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetEmbeddedCollectorForTests, getEmbeddedCollectorState } from "./embedded-collector";
import { __setOpenCollectorUiForTests, OpenAgentmetryPlugin } from "./index";

const createDbPath = (): string =>
  join(mkdtempSync(join(tmpdir(), "openagentmetry-plugin-")), "traces.sqlite");

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

const createPluginInput = () => {
  const logs: Array<Record<string, unknown>> = [];
  const prompts: Array<Record<string, unknown>> = [];

  return {
    input: {
      client: {
        app: {
          log: async (options?: Record<string, unknown>) => {
            logs.push(options ?? {});
            return { data: true };
          },
        },
        session: {
          prompt: async (options?: Record<string, unknown>) => {
            prompts.push(options ?? {});
            return { data: true };
          },
        },
      } as any,
      project: {} as any,
      directory: process.cwd(),
      worktree: join(process.cwd(), "fixtures", "demo-worktree"),
      serverUrl: new URL("http://127.0.0.1:4096"),
      $: {} as any,
    },
    logs,
    prompts,
  };
};

afterEach(() => {
  __resetEmbeddedCollectorForTests();
  __setOpenCollectorUiForTests(undefined);
});

describe("OpenAgentmetryPlugin", () => {
  test("starts an embedded collector when no OTLP URL is configured", async () => {
    await withEnv(
      {
        OPENAGENTMETRY_OTLP_URL: undefined,
        OPENAGENTMETRY_OTLP_ENABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_DISABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_PORT: "0",
        OPENAGENTMETRY_COLLECTOR_DB_PATH: createDbPath(),
      },
      async () => {
        const { input, logs } = createPluginInput();
        const plugin = await OpenAgentmetryPlugin(input);
        const env: Record<string, string> = {};

        await plugin["shell.env"]?.({ cwd: process.cwd() }, { env });

        expect(getEmbeddedCollectorState()).not.toBeUndefined();
        expect(env.OPENAGENTMETRY_ACTIVE_OTLP_URL).toMatch(
          /^http:\/\/127\.0\.0\.1:\d+\/v1\/traces$/,
        );
        expect(env.OPENAGENTMETRY_ACTIVE_COLLECTOR_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
        expect(env.OPENAGENTMETRY_ACTIVE_COLLECTOR_UI_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT).toBe(env.OPENAGENTMETRY_ACTIVE_OTLP_URL);
        expect(logs).toHaveLength(1);
      },
    );
  });

  test("uses the explicit OTLP URL without starting the embedded collector", async () => {
    await withEnv(
      {
        OPENAGENTMETRY_OTLP_URL: "http://collector.example/v1/traces",
        OPENAGENTMETRY_OTLP_ENABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_DISABLED: undefined,
      },
      async () => {
        const { input } = createPluginInput();
        const plugin = await OpenAgentmetryPlugin(input);
        const env: Record<string, string> = {};

        await plugin["shell.env"]?.({ cwd: process.cwd() }, { env });

        expect(getEmbeddedCollectorState()).toBeUndefined();
        expect(env.OPENAGENTMETRY_ACTIVE_OTLP_URL).toBe("http://collector.example/v1/traces");
        expect(env.OPENAGENTMETRY_ACTIVE_COLLECTOR_URL).toBe("http://collector.example");
      },
    );
  });

  test("does not start OTLP when disabled", async () => {
    await withEnv(
      {
        OPENAGENTMETRY_OTLP_URL: undefined,
        OPENAGENTMETRY_OTLP_ENABLED: "false",
        OPENAGENTMETRY_COLLECTOR_DISABLED: undefined,
      },
      async () => {
        const { input } = createPluginInput();
        const plugin = await OpenAgentmetryPlugin(input);
        const env: Record<string, string> = {};

        await plugin["shell.env"]?.({ cwd: process.cwd() }, { env });

        expect(getEmbeddedCollectorState()).toBeUndefined();
        expect(env.OPENAGENTMETRY_ACTIVE_OTLP_URL).toBeUndefined();
      },
    );
  });

  test("does not overwrite pre-existing OTEL exporter env vars", async () => {
    await withEnv(
      {
        OPENAGENTMETRY_OTLP_URL: undefined,
        OPENAGENTMETRY_OTLP_ENABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_DISABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_PORT: "0",
        OPENAGENTMETRY_COLLECTOR_DB_PATH: createDbPath(),
      },
      async () => {
        const { input } = createPluginInput();
        const plugin = await OpenAgentmetryPlugin(input);
        const env: Record<string, string> = {
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://existing-endpoint",
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://existing-traces",
        };

        await plugin["shell.env"]?.({ cwd: process.cwd() }, { env });

        expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("http://existing-endpoint");
        expect(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT).toBe("http://existing-traces");
      },
    );
  });

  test("registers a command to open the collector UI", async () => {
    await withEnv(
      {
        OPENAGENTMETRY_OTLP_URL: undefined,
        OPENAGENTMETRY_OTLP_ENABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_DISABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_PORT: "0",
        OPENAGENTMETRY_COLLECTOR_DB_PATH: createDbPath(),
      },
      async () => {
        const { input } = createPluginInput();
        const plugin = await OpenAgentmetryPlugin(input);
        const config: { command?: Record<string, { template: string; description: string }> } = {};

        await plugin.config?.(config as never);

        expect(config.command?.["openagentmetry.open-ui"]).toEqual({
          template: "Open the OpenAgentmetry collector UI in your default browser.",
          description: "Open OpenAgentmetry collector UI",
        });
      },
    );
  });

  test("opens the collector UI command target and notifies the session", async () => {
    await withEnv(
      {
        OPENAGENTMETRY_OTLP_URL: undefined,
        OPENAGENTMETRY_OTLP_ENABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_DISABLED: undefined,
        OPENAGENTMETRY_COLLECTOR_PORT: "0",
        OPENAGENTMETRY_COLLECTOR_DB_PATH: createDbPath(),
      },
      async () => {
        const openedUrls: string[] = [];
        __setOpenCollectorUiForTests(async (url) => {
          openedUrls.push(url);
        });

        const { input, prompts } = createPluginInput();
        const plugin = await OpenAgentmetryPlugin(input);

        await expect(
          plugin["command.execute.before"]?.(
            {
              command: "openagentmetry.open-ui",
              sessionID: "session-1",
              arguments: "",
            },
            {
              parts: [],
            },
          ),
        ).rejects.toThrow("Command handled by OpenAgentmetry plugin");

        expect(openedUrls).toHaveLength(1);
        expect(openedUrls[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect(prompts).toHaveLength(1);
      },
    );
  });

  test("reports when the collector UI command is unavailable", async () => {
    await withEnv(
      {
        OPENAGENTMETRY_OTLP_URL: undefined,
        OPENAGENTMETRY_OTLP_ENABLED: "false",
        OPENAGENTMETRY_COLLECTOR_DISABLED: undefined,
      },
      async () => {
        const openedUrls: string[] = [];
        __setOpenCollectorUiForTests(async (url) => {
          openedUrls.push(url);
        });

        const { input, prompts } = createPluginInput();
        const plugin = await OpenAgentmetryPlugin(input);

        await expect(
          plugin["command.execute.before"]?.(
            {
              command: "openagentmetry.open-ui",
              sessionID: "session-1",
              arguments: "",
            },
            {
              parts: [],
            },
          ),
        ).rejects.toThrow("Command handled by OpenAgentmetry plugin");

        expect(openedUrls).toHaveLength(0);
        expect(prompts).toHaveLength(1);
      },
    );
  });
});
