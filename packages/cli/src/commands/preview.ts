/**
 * @module commands/preview
 *
 * `agentforge preview` (alias: `plan`) — Show what would change on deploy.
 *
 * Runs the build pipeline, reads the current state via {@link StateManager},
 * computes a diff via `computeDiff()`, and prints a Terraform-style plan
 * output via {@link formatDiff}.
 */

import type { Command } from 'commander';
import type { AgentAssembly } from '@agentforge/constructs';
import { computeDiff, StateManager, hashResource } from '@agentforge/state';
import type { AssemblyResource } from '@agentforge/state';
import { loadConfig, resolveConfig } from '../config.js';
import { findProjectRoot } from '../project.js';
import { executeBuild } from './build.js';
import { banner, fatal, formatDiff, formatError, info } from '../output.js';

// ─── Command Registration ───────────────────────────────────────────────────

/**
 * Register the `preview` and `plan` commands on the given Commander program.
 *
 * `plan` is an alias for `preview`, kept for Terraform users.
 *
 * @param program - The root Commander program instance.
 */
export function registerPreviewCommand(program: Command): void {
  program
    .command('preview')
    .alias('plan')
    .description('Preview changes that would be applied on deploy')
    .option('--target <name>', 'Deployment target to preview against')
    .action(async (options: { target?: string }) => {
      try {
        await runPreview(options);
      } catch (err) {
        handlePreviewError(err);
      }
    });
}

// ─── Preview Implementation ─────────────────────────────────────────────────

/**
 * Run the preview/plan pipeline.
 *
 * @param options - Command options including optional target override.
 */
async function runPreview(options: { target?: string }): Promise<void> {
  console.log(banner());
  console.log('');

  // Build the assembly.
  const { assembly, projectDir } = await executeBuild();

  // Determine target.
  const config = resolveConfig(await loadConfig(projectDir));
  const target = options.target ?? config.defaultTarget;

  // Read current state.
  const stateManager = new StateManager(projectDir, target);
  const state = await stateManager.read();

  // Convert assembly resources to the format expected by computeDiff.
  const assemblyResources = toAssemblyResources(assembly);

  // Compute diff.
  const emptyState = {
    version: 1,
    target,
    resources: {},
    metadata: { lastBuildAt: '', assemblyHash: '' },
  };

  const diff = computeDiff(assemblyResources, state ?? emptyState);

  // Print formatted diff.
  console.log(formatDiff(diff));
  console.log('');

  info(`Target: ${target}`);
  if (!state) {
    info('No existing state found — all resources will be created.');
  }
  console.log('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert an assembly's resources map into the format expected by `computeDiff()`.
 *
 * @param assembly - The built Agent Assembly.
 * @returns A map of resource IDs to their type and hash.
 */
function toAssemblyResources(
  assembly: AgentAssembly,
): Record<string, AssemblyResource> {
  const result: Record<string, AssemblyResource> = {};

  for (const [id, resource] of Object.entries(assembly.resources)) {
    result[id] = {
      type: resource.type,
      hash: hashResource(resource as unknown as Record<string, unknown>),
    };
  }

  return result;
}

// ─── Error Handling ─────────────────────────────────────────────────────────

function handlePreviewError(err: unknown): never {
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
