# `@openagentmetry/opencode-agentmetry`

OpenCode plugin that emits OpenTelemetry traces for sessions, messages, tool calls, permissions, and file edits.

By default, the plugin can auto-start an embedded OTLP collector inside the OpenCode process and export traces to it. That gives you a local OTLP ingest endpoint plus the built-in collector UI without running a separate service first.

## Install

Add the package to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@openagentmetry/opencode-agentmetry"]
}
```

OpenCode installs npm plugins with Bun at startup.

## Default behavior

- If `OPENAGENTMETRY_OTLP_URL` is set, the plugin exports traces to that endpoint.
- Otherwise, it starts an embedded collector and exports to the collector running inside the OpenCode process.
- If port `4318` is busy, the embedded collector falls back to a random free port.

The plugin injects these environment variables into shell/tool subprocesses:

- `OPENAGENTMETRY_ACTIVE_OTLP_URL`
- `OPENAGENTMETRY_ACTIVE_COLLECTOR_URL`
- `OPENAGENTMETRY_ACTIVE_COLLECTOR_UI_URL`
- `OTEL_EXPORTER_OTLP_ENDPOINT` when not already set
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` when not already set

## Environment variables

### Plugin configuration

- `OPENAGENTMETRY_SERVICE_NAME`
- `OPENAGENTMETRY_TRACER_NAME`
- `OPENAGENTMETRY_OTLP_ENABLED`
- `OPENAGENTMETRY_OTLP_URL`

### Embedded collector configuration

- `OPENAGENTMETRY_COLLECTOR_DISABLED`
- `OPENAGENTMETRY_COLLECTOR_HOST`
- `OPENAGENTMETRY_COLLECTOR_PORT`
- `OPENAGENTMETRY_COLLECTOR_DB_PATH`

## External collector example

```bash
export OPENAGENTMETRY_OTLP_URL="http://127.0.0.1:4318/v1/traces"
```

## Embedded collector example

```bash
unset OPENAGENTMETRY_OTLP_URL
export OPENAGENTMETRY_COLLECTOR_PORT="4318"
```

## Notes

- The plugin runtime is Bun-oriented because the embedded collector uses Bun APIs.
