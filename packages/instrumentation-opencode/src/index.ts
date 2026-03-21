import { trace } from "@opentelemetry/api";
import {
  AgentAttributes,
  buildMessageAttributes,
  buildSessionAttributes,
  buildToolAttributes,
  SpanKinds,
} from "@openagentmetry/agent-semantic-contracts";

export type HookName =
  | "session.created"
  | "session.updated"
  | "session.deleted"
  | "tool.execute.before"
  | "tool.execute.after"
  | "message.created"
  | "message.updated"
  | "permission.resolved"
  | "file.edited";

export type HookHandler<TPayload> = (payload: TPayload) => void | Promise<void>;

export type HookMap = Partial<Record<HookName, HookHandler<any>>>;

export interface OpencodePlugin {
  name: string;
  hooks: HookMap;
}

export interface InstrumentationOptions {
  tracerName?: string;
  capturePayloads?: boolean;
}

export interface SessionPayload {
  agentId?: string;
  agentName?: string;
  sessionId?: string;
  sessionName?: string;
}

export interface ToolExecutePayload {
  toolName?: string;
  executionId?: string;
  inputBytes?: number;
  outputBytes?: number;
}

export interface MessagePayload {
  messageId?: string;
  role?: "user" | "assistant" | "system" | "tool";
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface PermissionPayload {
  name?: string;
  decision?: "allow" | "deny" | "prompt";
}

export interface FileEditedPayload {
  path?: string;
  bytes?: number;
}

const spanId = (() => {
  let counter = 0;
  return () => `${Date.now()}-${counter++}`;
})();

export const createOpencodeInstrumentation = (
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
