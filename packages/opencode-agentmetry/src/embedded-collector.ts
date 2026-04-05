import {
  DEFAULT_PORT,
  startCollector,
  type CollectorOptions,
} from "@openagentmetry/otlp-collector";

export interface EmbeddedCollectorOptions extends CollectorOptions {
  host?: string;
  port?: number;
  dbPath?: string;
}

export interface EmbeddedCollectorState {
  bindHost: string;
  requestedPort: number;
  actualPort: number;
  dbPath: string;
  collectorUrl: string;
  otlpTracesUrl: string;
  uiUrl: string;
  stop: () => void;
}

interface EmbeddedCollectorGlobals {
  __openagentmetryEmbeddedCollector?: EmbeddedCollectorState;
  __openagentmetryEmbeddedCollectorCleanupRegistered?: boolean;
}

const DEFAULT_BIND_HOST = "0.0.0.0";

const getGlobals = (): typeof globalThis & EmbeddedCollectorGlobals =>
  globalThis as typeof globalThis & EmbeddedCollectorGlobals;

const getClientHost = (bindHost: string): string => {
  if (bindHost === "0.0.0.0" || bindHost === "::") {
    return "127.0.0.1";
  }

  return bindHost;
};

const isAddressInUse = (error: unknown): boolean =>
  error instanceof Error &&
  ((typeof (error as unknown as { code?: unknown }).code === "string" &&
    (error as unknown as { code: string }).code === "EADDRINUSE") ||
    error.message.includes("in use"));

const createEmbeddedCollectorState = (
  options: EmbeddedCollectorOptions,
  requestedPort = options.port ?? DEFAULT_PORT,
): EmbeddedCollectorState => {
  const bindHost = options.host ?? DEFAULT_BIND_HOST;
  const collector = startCollector({
    ...options,
    host: bindHost,
    port: options.port ?? requestedPort,
  });
  const collectorUrl = `http://${getClientHost(bindHost)}:${collector.port}`;

  return {
    bindHost,
    requestedPort,
    actualPort: collector.port,
    dbPath: collector.dbPath,
    collectorUrl,
    otlpTracesUrl: `${collectorUrl}/v1/traces`,
    uiUrl: `${collectorUrl}/`,
    stop: () => collector.stop(),
  };
};

const registerCleanupHandlers = (): void => {
  const globals = getGlobals();
  if (globals.__openagentmetryEmbeddedCollectorCleanupRegistered) {
    return;
  }

  const cleanup = () => {
    const runtime = getGlobals().__openagentmetryEmbeddedCollector;
    runtime?.stop();
    delete getGlobals().__openagentmetryEmbeddedCollector;
  };

  process.once("exit", cleanup);
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
  globals.__openagentmetryEmbeddedCollectorCleanupRegistered = true;
};

export const startEmbeddedCollectorOnce = (
  options: EmbeddedCollectorOptions = {},
): EmbeddedCollectorState => {
  const globals = getGlobals();
  if (globals.__openagentmetryEmbeddedCollector) {
    return globals.__openagentmetryEmbeddedCollector;
  }

  registerCleanupHandlers();

  try {
    const runtime = createEmbeddedCollectorState(options);
    globals.__openagentmetryEmbeddedCollector = runtime;
    return runtime;
  } catch (error) {
    const requestedPort = options.port ?? DEFAULT_PORT;
    if (!isAddressInUse(error) || requestedPort === 0) {
      throw error;
    }

    const runtime = createEmbeddedCollectorState(
      {
        ...options,
        port: 0,
      },
      requestedPort,
    );
    globals.__openagentmetryEmbeddedCollector = runtime;
    return runtime;
  }
};

export const getEmbeddedCollectorState = (): EmbeddedCollectorState | undefined =>
  getGlobals().__openagentmetryEmbeddedCollector;

export const __resetEmbeddedCollectorForTests = (): void => {
  const globals = getGlobals();
  globals.__openagentmetryEmbeddedCollector?.stop();
  delete globals.__openagentmetryEmbeddedCollector;
};
