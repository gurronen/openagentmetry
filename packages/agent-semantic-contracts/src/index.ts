export const SEMANTIC_CONTRACTS_VERSION = "0.1.2" as const;

export const AgentAttributes = {
  agentId: "ai.agent.id",
  agentName: "ai.agent.name",
  sessionId: "ai.session.id",
  sessionName: "ai.session.name",
  toolName: "ai.tool.name",
  toolExecutionId: "ai.tool.execution_id",
  messageId: "ai.message.id",
  messageRole: "ai.message.role",
  modelName: "ai.model.name",
  promptTokens: "ai.tokens.prompt",
  completionTokens: "ai.tokens.completion",
  totalTokens: "ai.tokens.total",
  permissionName: "ai.permission.name",
  permissionDecision: "ai.permission.decision",
  filePath: "ai.file.path",
  fileByteLength: "ai.file.bytes",
} as const;

export type AgentAttributeKey = (typeof AgentAttributes)[keyof typeof AgentAttributes];

export const SpanKinds = {
  agent: "agent",
  session: "session",
  tool: "tool",
  message: "message",
  permission: "permission",
  file: "file",
} as const;

export type SpanKind = (typeof SpanKinds)[keyof typeof SpanKinds];

export const MessageRoles = {
  user: "user",
  assistant: "assistant",
  system: "system",
  tool: "tool",
} as const;

export type MessageRole = (typeof MessageRoles)[keyof typeof MessageRoles];

export type AttributeMap = Record<string, string | number | boolean | null | undefined>;

export const buildToolAttributes = (input: {
  toolName?: string;
  executionId?: string;
}): AttributeMap => ({
  [AgentAttributes.toolName]: input.toolName,
  [AgentAttributes.toolExecutionId]: input.executionId,
});

export const buildMessageAttributes = (input: {
  messageId?: string;
  role?: MessageRole;
  modelName?: string;
}): AttributeMap => ({
  [AgentAttributes.messageId]: input.messageId,
  [AgentAttributes.messageRole]: input.role,
  [AgentAttributes.modelName]: input.modelName,
});

export const buildSessionAttributes = (input: {
  agentId?: string;
  agentName?: string;
  sessionId?: string;
  sessionName?: string;
}): AttributeMap => ({
  [AgentAttributes.agentId]: input.agentId,
  [AgentAttributes.agentName]: input.agentName,
  [AgentAttributes.sessionId]: input.sessionId,
  [AgentAttributes.sessionName]: input.sessionName,
});
