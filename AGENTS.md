# Agent Instructions

## Repository Shape
- Monorepo with Bun workspaces.
- Packages live in `packages/`.
- Current packages: `packages/agent-semantic-contracts`, `packages/opencode-agentmetry`, `packages/otlp-collector`.
- Root config lives in `package.json`, `tsconfig.base.json`, `.oxfmtrc.json`, `.oxlintrc.json`, `knip.json`, and `lefthook.yml`.

## Package Manager
- Use `bun`: `bun install`, `bun run build`, `bun run typecheck`, `bun run test`, `bun run lint`, `bun run fmt`, `bun run knip`, `bun run preflight`, `bun run check`.
- Respect `bun.lock`.

## Version Control
- Repo is `jj`-backed and also has `.git/`.
- Prefer `jj` for day-to-day history operations.
- Use Git when a tool or workflow specifically requires Git.
- Check current bookmarks before editing or pushing; work may happen on non-`main` bookmarks such as `release/v0.1.1`.

## Key Conventions
- Use ESM only.
- Use named exports; do not introduce default exports.
- Keep public entrypoints in `src/index.ts` unless a package clearly needs more structure.
- Prefer workspace package names like `@openagentmetry/...` over relative cross-package imports.
- Keep new code fully typed.
- Formatting is enforced by `oxfmt`; use semicolons and double quotes.
- Build outputs belong in `dist/` and should not be hand-edited.

## Testing And Hooks
- Add tests alongside the package they cover using `*.test.ts`.
- For telemetry code, assert emitted attributes and span lifecycle behavior.
- `lefthook` pre-commit runs `bun run fmt` and `bun run lint:fix` sequentially.
- `lefthook` then runs `bun run fmt:check`, `bun run lint`, `bun run knip`, and `bun run test` in parallel.
- `bun run preflight` mirrors the pre-commit flow in a single command.

## Change Scope
- Keep edits minimal and package-focused.
- When changing shared semantic contracts, inspect all downstream workspace packages.
- Do not remove `dist/` ignore patterns or lockfile usage without a strong reason.

## Commit Attribution
- AI commits MUST include:
```text
Co-Authored-By: <agent name> <noreply@example.com>
```

## Local Skills
- No repo-local skill directory was found at `.claude/skills`.
