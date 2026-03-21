# Agent Instructions

## Repository Shape
- Monorepo with Bun workspaces.
- Packages live in `packages/`.
- Current packages: `packages/agent-semantic-contracts`, `packages/instrumentation-opencode`, `packages/opencode-agentllmetry`.
- Root config lives in `package.json`, `tsconfig.base.json`, `.oxfmtrc.json`, `.oxlintrc.json`, and `lefthook.yml`.

## Package Manager
- Use `bun`.
- Install deps: `bun install`
- Respect `bun.lock`.
- Workspace catalog versions are defined in the root `package.json`.

## Version Control
- This is a `jj`-backed repo layered on top of Git.
- The repo contains both `.git/` and `.jj/`.
- Prefer `jj` for day-to-day history operations.
- Use Git when a tool or workflow specifically requires Git.
- Current work may happen on non-`main` bookmarks such as `release/v0.1.1`; check before editing or pushing.

## jj Commands
```bash
jj status
jj log
jj git fetch
jj bookmark list
jj new release/v0.1.1
jj describe
jj squash
jj rebase
jj git push --bookmark release/v0.1.1
```

## Git Commands
```bash
git status --short --branch
git diff
git push origin release/v0.1.1
```

## Build Commands
```bash
bun run build
bun run clean
bun run typecheck
```

## Package-Scoped Commands
```bash
bun --cwd packages/agent-semantic-contracts run build
bun --cwd packages/instrumentation-opencode run build
bun --cwd packages/opencode-agentllmetry run build
bun --cwd packages/agent-semantic-contracts run typecheck
bun --cwd packages/instrumentation-opencode run typecheck
bun --cwd packages/opencode-agentllmetry run typecheck
```

## Lint And Format
```bash
bun run fmt
bun run fmt:check
bun run lint
bun run lint:fix
```

## Test Commands
```bash
bun run test
bun test --pass-with-no-tests
```

## Single Test Commands
- There are currently no test files in the repo.
```bash
bun test path/to/file.test.ts
bun test --test-name-pattern "my test name"
bun test path/to/file.test.ts --test-name-pattern "my test name"
```

## Hook Behavior
- `lefthook` is installed via `bun run prepare`.
- Pre-commit runs `bun run fmt`, `bun run fmt:check`, `bun run lint:fix`, and `bun run lint`.
- Pre-push runs `bun run test`.

## TypeScript Baseline
- Target: `ES2022`.
- Module format: `ESNext`.
- Module resolution: `Bundler`.
- `strict` and `verbatimModuleSyntax` are enabled.
- `resolveJsonModule`, `isolatedModules`, and `forceConsistentCasingInFileNames` are enabled.
- Package `tsconfig.json` files emit declarations into `dist/`.

## File And Module Conventions
- Use ESM only.
- Use named exports; do not introduce default exports.
- Keep public entrypoints in `src/index.ts` unless the package grows enough to justify more files.
- Build outputs belong in `dist/` and should not be hand-edited.

## Imports
- Put imports at the top of the file.
- Group external package imports before workspace imports.
- Separate type imports with `type` specifiers when importing types from value modules.
- Keep import lists compact and let `oxfmt` handle wrapping.
- Prefer workspace package names like `@openagentmetry/...` over relative cross-package imports.

## Formatting
- Formatting is enforced by `oxfmt`.
- Use semicolons.
- Use double quotes, not single quotes.
- Line width target is 100.
- Keep trailing commas where the formatter adds them.
- Do not preserve manual formatting that conflicts with `oxfmt`.

## Naming
- `PascalCase` for interfaces, exported type aliases, and exported constant registries.
- `camelCase` for functions, variables, parameters, and object properties.
- Prefer descriptive function names such as `buildToolAttributes`, `createOpencodeInstrumentation`, and `setupTracing`.
- Use string-literal unions for event names and small protocol enums.
- Use `SCREAMING_SNAKE_CASE` only for true constants like version markers.

## Types
- Keep all new code fully typed.
- Prefer explicit exported interfaces and type aliases over inferred public API shapes.
- Use `as const` for constant maps that also define derived union types.
- Prefer narrow unions over `string` when the allowed values are known.
- Preserve optional properties where payloads are partially known.

## API Design
- Keep package APIs small and composable.
- Prefer pure helpers for attribute construction and payload transformation.
- Prefer factory functions over classes unless stateful lifecycle management becomes necessary.
- Keep OpenTelemetry naming aligned with the semantic attribute constants.

## Error Handling
- Fail fast on invalid assumptions when a silent fallback would hide a bug.
- Use safe fallbacks only when the runtime genuinely allows partial data.
- Avoid broad `try/catch` blocks unless integrating with an unstable boundary.
- Do not swallow errors just to keep hooks quiet.

## Testing Guidance
- Add tests alongside the package they cover.
- Prefer `*.test.ts` naming so `bun test` finds them automatically.
- For telemetry code, assert emitted attributes and span lifecycle behavior.

## Change Scope
- Keep edits minimal and package-focused.
- When changing shared semantic contracts, inspect all downstream workspace packages.
- Do not remove `dist/` ignore patterns or lockfile usage without a strong reason.

## Cursor And Copilot Rules
- No `.cursorrules` file found.
- No `.cursor/rules/` directory found.
- No `.github/copilot-instructions.md` file found.

## Commit Attribution
- AI commits MUST include:
```text
Co-Authored-By: <agent name> <noreply@example.com>
```

## Local Skills
- No repo-local skill directory was found at `.claude/skills`.
