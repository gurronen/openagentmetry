import { createOpencodeInstrumentation, type OpencodePlugin } from "@openagentmetry/instrumentation-opencode";
import { Resource } from "@opentelemetry/resources";
import { BatchSpanProcessor, ConsoleSpanExporter, type SpanExporter } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

export interface SetupTracingOptions {
  serviceName: string;
  exporter?: SpanExporter;
  tracerName?: string;
  plugins?: OpencodePlugin[];
}

export interface SetupTracingResult {
  provider: NodeTracerProvider;
  plugins: OpencodePlugin[];
  shutdown: () => Promise<void>;
}

export const setupTracing = (options: SetupTracingOptions): SetupTracingResult => {
  const exporter = options.exporter ?? new ConsoleSpanExporter();
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: options.serviceName
    })
  });

  provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  provider.register();

  const plugin = createOpencodeInstrumentation({
    tracerName: options.tracerName
  });

  const plugins = options.plugins ? [...options.plugins, plugin] : [plugin];

  return {
    provider,
    plugins,
    shutdown: () => provider.shutdown()
  };
};
