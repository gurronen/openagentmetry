import type { Plugin } from "@opencode-ai/plugin";
import path from "node:path";

import {
  setupTracing,
  type FileEditedPayload,
  type MessagePayload,
  type PermissionPayload,
  type SessionPayload,
} from "./core";

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

const getBytes = (value: unknown): number | undefined => {
  if (typeof value === "string") {
    return Buffer.byteLength(value);
  }

  if (value === undefined) {
    return undefined;
  }

  return Buffer.byteLength(JSON.stringify(value));
};

const getServiceName = (worktree: string): string => {
  const fromEnv = getString(process.env.OPENAGENTMETRY_SERVICE_NAME);

  if (fromEnv) {
    return fromEnv;
  }

  const name = path.basename(worktree);
  return name.length > 0 ? name : "opencode";
};

export const OpenAgentmetryPlugin: Plugin = async ({ worktree }) => {
  const { plugins } = setupTracing({
    serviceName: getServiceName(worktree),
    tracerName: getString(process.env.OPENAGENTMETRY_TRACER_NAME),
  });

  const instrumentation = plugins[0];

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
        return;
      }

      if (type === "file.edited") {
        const filePayload: FileEditedPayload = {
          path: getString(properties.filePath, properties.path),
          bytes: getNumber(properties.bytes, properties.size),
        };

        await instrumentation.hooks["file.edited"]?.(filePayload);
      }
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
    },
  };
};
