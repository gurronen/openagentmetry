#!/usr/bin/env bun

import { parseCollectorCliOptions, startCollector } from "./index";

const collector = startCollector(parseCollectorCliOptions(Bun.argv.slice(2)));

console.log(`OpenAgentmetry collector listening on http://${collector.host}:${collector.port}`);
console.log(`OTLP endpoint: http://${collector.host}:${collector.port}/v1/traces`);
console.log(`Database: ${collector.dbPath}`);

process.on("SIGINT", () => {
  collector.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  collector.stop();
  process.exit(0);
});
