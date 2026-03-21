import { readFile, writeFile } from "node:fs/promises";

const publishablePackageJsonPaths = [
  "packages/agent-semantic-contracts/package.json",
  "packages/opencode-agentmetry/package.json",
] as const;

const semanticContractsIndexPath = "packages/agent-semantic-contracts/src/index.ts" as const;
const semanticContractsVersionPattern = /export const SEMANTIC_CONTRACTS_VERSION = ".*" as const;/;

const rootPackageJsonUrl = new URL("../package.json", import.meta.url);
const rootPackageJson = JSON.parse(await readFile(rootPackageJsonUrl, "utf8"));
const rootVersion = rootPackageJson.version;

if (typeof rootVersion !== "string" || rootVersion.length === 0) {
  throw new Error("Root package.json must define a version string");
}

for (const relativePath of publishablePackageJsonPaths) {
  const packageJsonUrl = new URL(`../${relativePath}`, import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));

  packageJson.version = rootVersion;

  await writeFile(packageJsonUrl, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`synced ${relativePath} -> ${rootVersion}`);
}

const semanticContractsIndexUrl = new URL(`../${semanticContractsIndexPath}`, import.meta.url);
const semanticContractsIndex = await readFile(semanticContractsIndexUrl, "utf8");
if (!semanticContractsVersionPattern.test(semanticContractsIndex)) {
  throw new Error(`Could not find semantic contracts version in ${semanticContractsIndexPath}`);
}

const nextSemanticContractsIndex = semanticContractsIndex.replace(
  semanticContractsVersionPattern,
  `export const SEMANTIC_CONTRACTS_VERSION = "${rootVersion}" as const;`,
);

await writeFile(semanticContractsIndexUrl, nextSemanticContractsIndex);
console.log(`synced ${semanticContractsIndexPath} -> ${rootVersion}`);
