/**
 * @module commands/diff
 *
 * `agentforge diff` — Show detailed changes between current and deployed state.
 *
 * Like `preview` but focuses on showing property-level changes between the
 * current assembly output and the last deployed state. For Phase 1 this is a
 * thinner version of preview that emphasises the resource-level diff; detailed
 * property diffing will be added in a later phase.
 */

import type { Command } from 'commander';
import type { AgentAssembly } from '@agentforge/constructs';
import { computeDiff, StateManager, hashResource } from '@agentforge/state';
import type { AssemblyResource } from '@agentforge/state';
import { loadConfig, resolveConfig } from '../config.js';
import { findProjectRoot } from '../project.js';
import { executeBuild } from './build.js';
import { banner, fatal, formatDiff, formatError, info, pc } from '../output.js';

// ─── Command Registration ───────────────────────────────────────────────────

/**
 * Register the `diff` command on the given Commander program.
 *
 * @param program - The root Commander program instance.
 */
export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .description('Show detailed changes between current and last deployed assembly')
    .option('--target <name>', 'Deployment target to diff against')
    .action(async (options: { target?: string }) => {
      try {
        await runDiff(options);
      } catch (err) {
        handleDiffError(err);
      }
    });
}

// ─── Diff Implementation ────────────────────────────────────────────────────

/**
 * Run the diff pipeline: build -> compare against state -> print changes.
 *
 * @param options - Command options including optional target override.
 */
async function runDiff(options: { target?: string }): Promise<void> {
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

  if (!state) {
    info(`No existing state for target '${target}'. All resources are new.`);
    console.log('');

    // Show all resources as additions.
    for (const [id, resource] of Object.entries(assembly.resources)) {
      console.log(pc.green(`  + ${resource.type.padEnd(35)} ${id}`));
    }
    console.log('');
    return;
  }

  // Convert assembly resources.
  const assemblyResources = toAssemblyResources(assembly);

  // Compute diff.
  const diff = computeDiff(assemblyResources, state);

  // Print the overview diff.
  console.log(formatDiff(diff));
  console.log('');

  // Show additional detail for changed resources.
  if (diff.changed.length > 0) {
    console.log(pc.bold('  Changed resources:'));
    console.log('');

    for (const change of diff.changed) {
      console.log(pc.yellow(`  ~ ${change.type.padEnd(35)} ${change.id}`));
      console.log(pc.dim(`      old hash: ${change.oldHash ?? 'unknown'}`));
      console.log(pc.dim(`      new hash: ${change.newHash ?? 'unknown'}`));
      console.log('');
    }
  }

  // Summary.
  const total = diff.added.length + diff.changed.length + diff.removed.length;
  if (total === 0) {
    info('No differences detected. State is up-to-date.');
  } else {
    info(`${total} resource${total === 1 ? '' : 's'} affected.`);
  }
  console.log('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert an assembly's resources map into the format expected by `computeDiff()`.
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

function handleDiffError(err: unknown): never {
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
