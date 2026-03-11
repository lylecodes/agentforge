# AgentForge

TypeScript framework for defining AI agents as code and synthesizing them to multiple deployment targets. The "Terraform for AI agents."

## Architecture

Two-phase synthesis pipeline:
1. **Synth**: User code (TypeScript) → Construct tree → Agent Assembly IR (JSON)
2. **Compile**: Agent Assembly → Target-specific artifacts (local runtime, Docker, CrewAI, etc.)

Built on the `constructs` npm package (v10.x) — the same foundation as AWS CDK, CDKtf, and CDK8s.

## Monorepo Structure

```
packages/
  constructs/   @agentforge/constructs  — Foundation: App, Stack, AgentResourceBase, tokens, validation, assembly IR, aspects, protocols
  core/         @agentforge/core        — Agent constructs: Agent, Model, Tool, Prompt, MCPServer, defineAgent()
  state/        @agentforge/state       — Deployment state tracking, diffing, state files
  target-local/ @agentforge/target-local — Compiles assembly to runnable Node.js code (Vercel AI SDK)
  cli/          @agentforge/cli         — CLI binary: init, build, preview, deploy, status, destroy, diff
```

**Dependency order:** constructs → core, state, target-local → cli

## Tech Stack

- **Runtime:** Node.js >=20, ESM-only (`"type": "module"`)
- **Language:** TypeScript 5.7+ with `verbatimModuleSyntax: true`, `strict: true`
- **Package manager:** pnpm workspaces
- **Build:** Turborepo (`turbo build/test/typecheck`)
- **Test:** Vitest (`pnpm turbo test`)
- **Versioning:** Changesets

## Key Commands

```bash
pnpm turbo build          # Build all packages
pnpm turbo test           # Run all 564 tests
pnpm turbo typecheck      # Type-check without emitting
pnpm -F @agentforge/core test  # Test single package
```

## Code Conventions

- **ESM imports require `.js` extensions**: `import { App } from './app.js'`
- **Use `import type` for type-only imports**: enforced by `verbatimModuleSyntax`
- **Base class for resources**: Extend `AgentResourceBase` (not `Construct` directly). Override `resolveProperties()` to serialize to assembly.
- **Test files**: `src/__tests__/*.test.ts` — use vitest `describe`/`it`/`expect`
- **Snapshot tests**: Used for assembly output and generated code
- **Error codes**: AF001-AF599 ranges defined in `constructs/src/errors.ts`
- **Secrets**: Never store values — use `SecretRef.env('KEY')` etc.
- **Tokens**: For cross-construct references, resolved via Kahn's algorithm topological sort

## Assembly IR

The Agent Assembly (`agentforge.out/stacks/<name>/assembly.json`) is the contract between synth and compile. It contains:
- `resources`: Record of all agent resources (type, id, properties, dependencies)
- `connections`: Edges between resources (19 edge types)
- `parameters`: User-configurable values
- `protocols`: Generated AGENTS.md, A2A card, Agent Skills manifest

## Adding a New Resource Type

1. Create class in appropriate package extending `AgentResourceBase`
2. Set `RESOURCE_TYPE` constant (e.g., `agentforge::core::Agent`)
3. Override `resolveProperties()` to return serializable properties
4. Override `validate()` for custom validation rules
5. Add tests (unit + snapshot of assembly output)

## Adding a New Target

1. Create `packages/target-<name>/` package
2. Implement `ITargetCompiler` interface from `@agentforge/target-local/types`
3. Methods: `validate()`, `compile()`, optionally `deploy()`, `destroy()`
4. Target reads `AgentAssembly`, writes target-specific files to output dir

## Roadmap

Full roadmap at `/Users/lylejens/workplace/research/agents-as-code/roadmap-v2.md`. Currently implementing Phase 1 (Foundation + Core + LocalTarget).
