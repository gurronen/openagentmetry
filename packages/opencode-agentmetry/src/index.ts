import type { Plugin } from "@opencode-ai/plugin";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  AgentAttributes,
  buildMessageAttributes,
  buildSessionAttributes,
  buildToolAttributes,
  SpanKinds,
} from "@openagentmetry/agent-semantic-contracts";
import { Resource } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import path from "node:path";

import { startEmbeddedCollectorOnce } from "./embedded-collector";

type HookName =
  | "session.created"
  | "session.updated"
  | "session.deleted"
  | "tool.execute.before"
  | "tool.execute.after"
  | "message.created"
  | "message.updated"
  | "permission.resolved"
  | "file.edited";

type HookHandler<TPayload> = (payload: TPayload) => void | Promise<void>;

type HookMap = Partial<Record<HookName, HookHandler<any>>>;

interface OpencodePlugin {
  name: string;
  hooks: HookMap;
}

interface InstrumentationOptions {
  tracerName?: string;
}

interface SessionPayload {
  agentId?: string;
  agentName?: string;
  sessionId?: string;
  sessionName?: string;
}

interface ToolExecutePayload {
  toolName?: string;
  executionId?: string;
  inputBytes?: number;
  outputBytes?: number;
}

interface MessagePayload {
  messageId?: string;
  role?: "user" | "assistant" | "system" | "tool";
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

interface PermissionPayload {
  name?: string;
  decision?: "allow" | "deny" | "prompt";
}

interface FileEditedPayload {
  path?: string;
  bytes?: number;
}

interface SetupTracingOptions {
  serviceName: string;
  exporter?: SpanExporter;
  tracerName?: string;
  plugins?: OpencodePlugin[];
}

interface SetupTracingResult {
  provider: NodeTracerProvider;
  plugins: OpencodePlugin[];
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

const spanId = (() => {
  let counter = 0;
  return () => `${Date.now()}-${counter++}`;
})();

const createOpencodeInstrumentation = (
  options: InstrumentationOptions = {},
): OpencodePlugin => {
  const tracer = trace.getTracer(options.tracerName ?? "opencode-instrumentation");
  const toolSpans = new Map<string, ReturnType<typeof tracer.startSpan>>();

  return {
    name: "opencode-instrumentation",
    hooks: {
      "session.created": (payload: SessionPayload) => {
        const span = tracer.startSpan("session.created", {
          attributes: {
            ...buildSessionAttributes(payload),
            ["ai.span.kind"]: SpanKinds.session,
          },
        });
        span.end();
      },
      "session.updated": (payload: SessionPayload) => {
        const span = tracer.startSpan("session.updated", {
          attributes: {
            ...buildSessionAttributes(payload),
            ["ai.span.kind"]: SpanKinds.session,
          },
        });
        span.end();
      },
      "session.deleted": (payload: SessionPayload) => {
        const span = tracer.startSpan("session.deleted", {
          attributes: {
            ...buildSessionAttributes(payload),
            ["ai.span.kind"]: SpanKinds.session,
          },
        });
        span.end();
      },
      "tool.execute.before": (payload: ToolExecutePayload) => {
        const executionId = payload.executionId ?? spanId();
        const span = tracer.startSpan("tool.execute", {
          attributes: {
            ...buildToolAttributes({
              toolName: payload.toolName,
              executionId,
            }),
            ["ai.span.kind"]: SpanKinds.tool,
          },
        });
        toolSpans.set(executionId, span);
      },
      "tool.execute.after": (payload: ToolExecutePayload) => {
        const executionId = payload.executionId ?? spanId();
        const span = toolSpans.get(executionId);
        const attributes = {
          ...buildToolAttributes({
            toolName: payload.toolName,
            executionId,
          }),
          [AgentAttributes.fileByteLength]: payload.outputBytes,
        };

        if (span) {
          span.setAttributes(attributes);
          span.end();
          toolSpans.delete(executionId);
          return;
        }

        const fallbackSpan = tracer.startSpan("tool.execute", {
          attributes: {
            ...attributes,
            ["ai.span.kind"]: SpanKinds.tool,
          },
        });
        fallbackSpan.end();
      },
      "message.created": (payload: MessagePayload) => {
        const span = tracer.startSpan("message.created", {
          attributes: {
            ...buildMessageAttributes(payload),
            [AgentAttributes.promptTokens]: payload.promptTokens,
            [AgentAttributes.completionTokens]: payload.completionTokens,
            [AgentAttributes.totalTokens]: payload.totalTokens,
            ["ai.span.kind"]: SpanKinds.message,
          },
        });
        span.end();
      },
      "message.updated": (payload: MessagePayload) => {
        const span = tracer.startSpan("message.updated", {
          attributes: {
            ...buildMessageAttributes(payload),
            [AgentAttributes.promptTokens]: payload.promptTokens,
            [AgentAttributes.completionTokens]: payload.completionTokens,
            [AgentAttributes.totalTokens]: payload.totalTokens,
            ["ai.span.kind"]: SpanKinds.message,
          },
        });
        span.end();
      },
      "permission.resolved": (payload: PermissionPayload) => {
        const span = tracer.startSpan("permission.resolved", {
          attributes: {
            [AgentAttributes.permissionName]: payload.name,
            [AgentAttributes.permissionDecision]: payload.decision,
            ["ai.span.kind"]: SpanKinds.permission,
          },
        });
        span.end();
      },
      "file.edited": (payload: FileEditedPayload) => {
        const span = tracer.startSpan("file.edited", {
          attributes: {
            [AgentAttributes.filePath]: payload.path,
            [AgentAttributes.fileByteLength]: payload.bytes,
            ["ai.span.kind"]: SpanKinds.file,
          },
        });
        span.end();
      },
    },
  };
};

const setupTracing = (options: SetupTracingOptions): SetupTracingResult => {
  const exporter = options.exporter ?? new ConsoleSpanExporter();
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: options.serviceName,
    }),
  });

  provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  provider.register();

  const plugin = createOpencodeInstrumentation({
    tracerName: options.tracerName,
  });

  const plugins = options.plugins ? [...options.plugins, plugin] : [plugin];

  return {
    provider,
    plugins,
    flush: () => provider.forceFlush(),
    shutdown: () => provider.shutdown(),
  };
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  return value as Record<string, unknown>;
};

const getString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
};

const getNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
};

const getInteger = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
};

const getBytes = (value: unknown): number | undefined => {
  if (typeof value === "string") {
    return Buffer.byteLength(value);
  }

  if (value === undefined) {
    return undefined;
  }

  return Buffer.byteLength(JSON.stringify(value));
};

const getBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
};

const getServiceName = (worktree: string): string => {
  const fromEnv = getString(process.env.OPENAGENTMETRY_SERVICE_NAME);

  if (fromEnv) {
    return fromEnv;
  }

  const name = path.basename(worktree);
  return name.length > 0 ? name : "opencode";
};

type RuntimeMode = "disabled" | "embedded" | "external";

interface TelemetryRuntime {
  mode: RuntimeMode;
  exporter?: OTLPTraceExporter;
  activeOtlpUrl?: string;
  activeCollectorUrl?: string;
  activeCollectorUiUrl?: string;
  bindHost?: string;
  requestedPort?: number;
  actualPort?: number;
  dbPath?: string;
  forceFlush: boolean;
}

const deriveOtlpEndpoint = (otlpUrl: string): string => {
  if (otlpUrl.endsWith("/v1/traces")) {
    return otlpUrl.slice(0, -"/v1/traces".length);
  }

  return otlpUrl;
};

const resolveTelemetryRuntime = (): TelemetryRuntime => {
  const otlpEnabled = getBoolean(process.env.OPENAGENTMETRY_OTLP_ENABLED);
  const otlpUrl = getString(process.env.OPENAGENTMETRY_OTLP_URL);
  const collectorDisabled = getBoolean(process.env.OPENAGENTMETRY_COLLECTOR_DISABLED);
  const forceFlush = getBoolean(process.env.OPENAGENTMETRY_FORCE_FLUSH) === true;

  if (otlpUrl) {
    return {
      mode: "external",
      exporter: new OTLPTraceExporter({ url: otlpUrl }),
      activeOtlpUrl: otlpUrl,
      activeCollectorUrl: deriveOtlpEndpoint(otlpUrl),
      forceFlush,
    };
  }

  if (otlpEnabled === false || collectorDisabled === true) {
    return {
      mode: "disabled",
      forceFlush,
    };
  }

  const collector = startEmbeddedCollectorOnce({
    host: getString(process.env.OPENAGENTMETRY_COLLECTOR_HOST) ?? "0.0.0.0",
    port: getInteger(process.env.OPENAGENTMETRY_COLLECTOR_PORT),
    dbPath: getString(process.env.OPENAGENTMETRY_COLLECTOR_DB_PATH),
  });

  return {
    mode: "embedded",
    exporter: new OTLPTraceExporter({ url: collector.otlpTracesUrl }),
    activeOtlpUrl: collector.otlpTracesUrl,
    activeCollectorUrl: collector.collectorUrl,
    activeCollectorUiUrl: collector.uiUrl,
    bindHost: collector.bindHost,
    requestedPort: collector.requestedPort,
    actualPort: collector.actualPort,
    dbPath: collector.dbPath,
    forceFlush,
  };
};

const logRuntimeStartup = async (
  client: {
    app?: {
      log?: (options?: Record<string, unknown>) => Promise<unknown>;
    };
  },
  directory: string,
  runtime: TelemetryRuntime,
): Promise<void> => {
  try {
    await client.app?.log?.({
      query: { directory },
      body: {
        service: "openagentmetry",
        level: "info",
        message: "OpenAgentmetry initialized",
        extra: {
          mode: runtime.mode,
          bindHost: runtime.bindHost,
          requestedPort: runtime.requestedPort,
          actualPort: runtime.actualPort,
          otlpUrl: runtime.activeOtlpUrl,
          collectorUrl: runtime.activeCollectorUrl,
          uiUrl: runtime.activeCollectorUiUrl,
          dbPath: runtime.dbPath,
        },
      },
    });
  } catch {}
};

const applyTelemetryShellEnv = (runtime: TelemetryRuntime, env: Record<string, string>): void => {
  if (runtime.activeOtlpUrl) {
    env.OPENAGENTMETRY_ACTIVE_OTLP_URL = runtime.activeOtlpUrl;
  }

  if (runtime.activeCollectorUrl) {
    env.OPENAGENTMETRY_ACTIVE_COLLECTOR_URL = runtime.activeCollectorUrl;
  }

  if (runtime.activeCollectorUiUrl) {
    env.OPENAGENTMETRY_ACTIVE_COLLECTOR_UI_URL = runtime.activeCollectorUiUrl;
  }

  if (runtime.activeOtlpUrl && env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT === undefined) {
    if (process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT === undefined) {
      env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = runtime.activeOtlpUrl;
    }
  }

  if (runtime.activeCollectorUrl && env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined) {
    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined) {
      env.OTEL_EXPORTER_OTLP_ENDPOINT = runtime.activeCollectorUrl;
    }
  }
};

export const OpenAgentmetryPlugin: Plugin = async ({ client, directory, worktree }) => {
  const runtime = resolveTelemetryRuntime();
  const tracing = setupTracing({
    serviceName: getServiceName(worktree),
    tracerName: getString(process.env.OPENAGENTMETRY_TRACER_NAME),
    exporter: runtime.exporter,
  });
  const { plugins } = tracing;

  const instrumentation = plugins[0];
  const flushIfNeeded = async () => {
    if (!runtime.forceFlush) {
      return;
    }

    await tracing.flush();
  };

  await logRuntimeStartup(
    client as { app?: { log?: (options?: Record<string, unknown>) => Promise<unknown> } },
    directory,
    runtime,
  );

  return {
    event: async ({ event }) => {
      const payload = asRecord(event);
      const type = getString(payload?.type);
      const properties = asRecord(payload?.properties) ?? payload;

      if (!type || !properties) {
        return;
      }

      if (type === "session.created" || type === "session.updated" || type === "session.deleted") {
        const sessionPayload: SessionPayload = {
          agentId: getString(properties.agentID, properties.agentId),
          agentName: getString(properties.agentName, properties.agent),
          sessionId: getString(properties.sessionID, properties.sessionId),
          sessionName: getString(properties.title, properties.sessionName, properties.name),
        };

        await instrumentation.hooks[type]?.(sessionPayload);
        await flushIfNeeded();
        return;
      }

      if (type === "message.updated" || type === "message.created") {
        const messagePayload: MessagePayload = {
          messageId: getString(properties.messageID, properties.messageId, properties.id),
          role: getString(properties.role) as MessagePayload["role"],
          modelName: getString(properties.modelID, properties.modelId, properties.model),
          promptTokens: getNumber(properties.inputTokens, properties.promptTokens),
          completionTokens: getNumber(properties.outputTokens, properties.completionTokens),
          totalTokens: getNumber(properties.totalTokens),
        };

        await instrumentation.hooks[type]?.(messagePayload);
        await flushIfNeeded();
        return;
      }

      if (type === "permission.replied") {
        const permissionPayload: PermissionPayload = {
          name: getString(properties.tool, properties.permission, properties.name),
          decision: getString(
            properties.status,
            properties.decision,
          ) as PermissionPayload["decision"],
        };

        await instrumentation.hooks["permission.resolved"]?.(permissionPayload);
        await flushIfNeeded();
        return;
      }

      if (type === "file.edited") {
        const filePayload: FileEditedPayload = {
          path: getString(properties.filePath, properties.path),
          bytes: getNumber(properties.bytes, properties.size),
        };

        await instrumentation.hooks["file.edited"]?.(filePayload);
        await flushIfNeeded();
      }
    },
    "shell.env": async (_input, output) => {
      applyTelemetryShellEnv(runtime, output.env);
    },
    "tool.execute.before": async (input, output) => {
      await instrumentation.hooks["tool.execute.before"]?.({
        toolName: input.tool,
        executionId: input.callID,
        inputBytes: getBytes(output.args),
      });
    },
    "tool.execute.after": async (input, output) => {
      await instrumentation.hooks["tool.execute.after"]?.({
        toolName: input.tool,
        executionId: input.callID,
        outputBytes: getBytes(output.output),
      });
      await flushIfNeeded();
    },
  };
};
