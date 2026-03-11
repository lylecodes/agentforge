/**
 * @module commands/deploy
 *
 * `agentforge deploy` — Build, compile, and deploy an agent system.
 *
 * Runs the build pipeline, loads the appropriate target compiler (currently
 * only `LocalTargetCompiler`), compiles the assembly into target-specific
 * artifacts, deploys them, and updates the state file.
 */

import { join } from 'node:path';
import type { Command } from 'commander';
import type { AgentAssembly } from '@agentforge/constructs';
import { StateManager, hashResource } from '@agentforge/state';
import type { StateResource } from '@agentforge/state';
import { LocalTargetCompiler } from '@agentforge/target-local';
import { loadConfig, resolveConfig } from '../config.js';
import { findProjectRoot } from '../project.js';
import { executeBuild } from './build.js';
import { banner, fatal, formatError, info, success, warn } from '../output.js';

// ─── Command Registration ───────────────────────────────────────────────────

/**
 * Register the `deploy` command on the given Commander program.
 *
 * @param program - The root Commander program instance.
 */
export function registerDeployCommand(program: Command): void {
  program
    .command('deploy')
    .description('Build, compile, and deploy the agent system')
    .option('--target <name>', 'Deployment target (default from config)')
    .action(async (options: { target?: string }) => {
      try {
        await runDeploy(options);
      } catch (err) {
        handleDeployError(err);
      }
    });
}

// ─── Deploy Implementation ──────────────────────────────────────────────────

/**
 * Run the full deploy pipeline: build -> compile -> deploy -> update state.
 *
 * @param options - Command options including optional target override.
 */
async function runDeploy(options: { target?: string }): Promise<void> {
  console.log(banner());
  console.log('');

  const startTime = Date.now();

  // 1. Build the assembly.
  info('Building...');
  const { assembly, projectDir, outDir } = await executeBuild();
  const resourceCount = Object.keys(assembly.resources).length;
  success(`Built ${resourceCount} resource${resourceCount === 1 ? '' : 's'}`);

  // 2. Determine target.
  const config = resolveConfig(await loadConfig(projectDir));
  const target = options.target ?? config.defaultTarget;

  // 3. Load target compiler.
  const compiler = loadTargetCompiler(target);
  info(`Target: ${target} (${compiler.name} v${compiler.version})`);

  // 4. Validate assembly against target.
  const validation = compiler.validate(assembly);
  if (!validation.valid) {
    for (const diag of validation.errors) {
      console.error(pc_format_validation_error(diag));
    }
    fatal(`Assembly validation failed for target '${target}'.`);
  }
  for (const w of validation.warnings) {
    warn(typeof w === 'string' ? w : (w.message ?? String(w)));
  }

  // 5. Compile.
  info('Compiling...');
  const compileOutDir = join(outDir, target);
  const compileResult = compiler.compile(assembly, compileOutDir);
  success(`Compiled ${compileResult.artifacts.length} artifact${compileResult.artifacts.length === 1 ? '' : 's'}`);

  if (compileResult.unsupportedResources.length > 0) {
    warn(`Skipped unsupported resources: ${compileResult.unsupportedResources.join(', ')}`);
  }

  // 6. Deploy (if the compiler supports it).
  if (compiler.deploy) {
    info('Deploying...');
    const deployResult = await compiler.deploy(compileResult, { projectDir: compileOutDir });
    success(`Deployed to ${target}`);

    // 7. Update state file.
    const stateManager = new StateManager(projectDir, target);
    await updateState(stateManager, assembly, target, deployResult);
  } else {
    warn(`Target '${target}' does not support automated deployment.`);
    info('Compile artifacts have been written — deploy manually.');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  success(`Done in ${elapsed}s`);
  console.log('');
}

// ─── Target Compiler Loading ────────────────────────────────────────────────

/**
 * Minimal interface for a target compiler.
 *
 * Mirrors `ITargetCompiler` from the roadmap. The real interface lives in
 * `@agentforge/constructs`; we define a structural subset here to avoid
 * tight coupling to unbuilt packages.
 */
interface TargetCompiler {
  readonly name: string;
  readonly version: string;
  validate(assembly: AgentAssembly): { valid: boolean; errors: Array<string | { message?: string }>; warnings: Array<string | { message?: string }> };
  compile(assembly: AgentAssembly, outDir: string): { artifacts: Array<{ path: string; type: string; description: string }>; warnings: string[]; unsupportedResources: string[] };
  deploy?(compileResult: unknown, options: Record<string, unknown>): Promise<Record<string, unknown>>;
  destroy?(state: unknown): Promise<Record<string, unknown>>;
}

/**
 * Load the target compiler for the given target name.
 *
 * Currently only supports `'local'` via `@agentforge/target-local`.
 * Future targets will be discovered via installed `@agentforge/target-*` packages.
 *
 * @param target - The target name (e.g., `'local'`, `'docker'`).
 * @returns A target compiler instance.
 */
function loadTargetCompiler(target: string): TargetCompiler {
  switch (target) {
    case 'local':
      return new LocalTargetCompiler() as unknown as TargetCompiler;
    default:
      throw new Error(
        `Unknown deployment target: '${target}'.\n` +
        `Available targets: local\n` +
        `Install additional targets with: npm install @agentforge/target-${target}`,
      );
  }
}

// ─── State Management ───────────────────────────────────────────────────────

/**
 * Update the state file after a successful deployment.
 */
async function updateState(
  stateManager: StateManager,
  assembly: AgentAssembly,
  target: string,
  deployResult: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  // Build resource state records from the assembly.
  const resources: Record<string, StateResource> = {};
  for (const [id, resource] of Object.entries(assembly.resources)) {
    const hash = hashResource(resource as unknown as Record<string, unknown>);
    resources[id] = {
      type: resource.type,
      id,
      status: 'deployed',
      lastDeployedAt: now,
      lastAssemblyHash: hash,
      outputs: extractOutputs(id, deployResult),
    };
  }

  stateManager.write({
    version: 1,
    target,
    resources,
    metadata: {
      lastBuildAt: now,
      assemblyHash: assembly.metadata.assemblyHash,
    },
  });
}

/**
 * Extract per-resource outputs from a deploy result, if available.
 */
function extractOutputs(
  resourceId: string,
  deployResult: Record<string, unknown>,
): Record<string, string> {
  const outputs = (deployResult as { outputs?: Record<string, Record<string, string>> }).outputs;
  if (outputs && typeof outputs === 'object' && resourceId in outputs) {
    return outputs[resourceId];
  }
  return {};
}

// ─── Error Handling ─────────────────────────────────────────────────────────

/**
 * Format a validation error/warning message.
 */
function pc_format_validation_error(diag: string | { message?: string }): string {
  if (typeof diag === 'string') return `  ${diag}`;
  return `  ${diag.message ?? 'Unknown validation error'}`;
}

function handleDeployError(err: unknown): never {
  if (
    err instanceof Error &&
    'diagnostic' in err &&
    typeof (err as Record<string, unknown>).diagnostic === 'object'
  ) {
    const diagnostic = (err as { diagnostic: import('@agentforge/constructs').AgentForgeDiagnostic }).diagnostic;
    console.error('');
    console.error(formatError(diagnostic));
    console.error('');
    process.exit(1);
  }

  fatal(err instanceof Error ? err.message : String(err));
}
