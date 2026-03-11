/**
 * @module commands/destroy
 *
 * `agentforge destroy` — Tear down deployed resources.
 *
 * Reads the state file, calls the target compiler's `destroy()` method if
 * available, clears the state, and prints a summary. Asks for confirmation
 * unless `--yes` is passed.
 */

import * as readline from 'node:readline';
import type { Command } from 'commander';
import { StateManager } from '@agentforge/state';
import { LocalTargetCompiler } from '@agentforge/target-local';
import { loadConfig, resolveConfig } from '../config.js';
import { findProjectRoot } from '../project.js';
import { banner, fatal, formatError, info, pc, success, warn } from '../output.js';

// ─── Command Registration ───────────────────────────────────────────────────

/**
 * Register the `destroy` command on the given Commander program.
 *
 * @param program - The root Commander program instance.
 */
export function registerDestroyCommand(program: Command): void {
  program
    .command('destroy')
    .description('Tear down deployed resources')
    .option('--target <name>', 'Deployment target to destroy')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (options: { target?: string; yes?: boolean }) => {
      try {
        await runDestroy(options);
      } catch (err) {
        handleDestroyError(err);
      }
    });
}

// ─── Destroy Implementation ─────────────────────────────────────────────────

/**
 * Run the destroy pipeline: confirm -> destroy via target -> clear state.
 *
 * @param options - Command options including optional target override and
 *   confirmation skip flag.
 */
async function runDestroy(options: { target?: string; yes?: boolean }): Promise<void> {
  console.log(banner());
  console.log('');

  const projectDir = findProjectRoot();
  const config = resolveConfig(await loadConfig(projectDir));
  const target = options.target ?? config.defaultTarget;

  const stateManager = new StateManager(projectDir, target);
  const state = await stateManager.read();

  if (!state) {
    info(`No resources deployed for target '${target}'. Nothing to destroy.`);
    console.log('');
    return;
  }

  const resourceIds = Object.keys(state.resources);
  const resourceCount = resourceIds.length;

  // Show what will be destroyed.
  console.log(pc.bold(pc.red(`  Destroying ${resourceCount} resource${resourceCount === 1 ? '' : 's'} (target: ${target}):`)));
  console.log('');
  for (const [id, resource] of Object.entries(state.resources)) {
    console.log(pc.red(`  - ${resource.type.padEnd(35)} ${id}`));
  }
  console.log('');

  // Confirm unless --yes.
  if (!options.yes) {
    const confirmed = await askConfirmation(
      'Are you sure you want to destroy all resources? This cannot be undone.',
    );
    if (!confirmed) {
      info('Destroy cancelled.');
      console.log('');
      return;
    }
  }

  // Load target compiler and call destroy if available.
  try {
    const compiler = loadTargetCompiler(target);
    if (compiler.destroy) {
      info('Destroying resources...');
      await compiler.destroy(state);
      success('Resources destroyed via target compiler');
    } else {
      warn(`Target '${target}' does not support automated teardown.`);
      info('Clearing state file — resources may need manual cleanup.');
    }
  } catch (err) {
    warn(`Target destroy failed: ${err instanceof Error ? err.message : String(err)}`);
    info('Clearing state file anyway.');
  }

  // Clear state file.
  stateManager.clear();
  success(`Destroyed ${resourceCount} resource${resourceCount === 1 ? '' : 's'}`);
  console.log('');
}

// ─── Confirmation Prompt ────────────────────────────────────────────────────

/**
 * Ask the user for yes/no confirmation via stdin.
 *
 * @param question - The prompt to display.
 * @returns `true` if the user confirmed, `false` otherwise.
 */
function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// ─── Target Compiler Loading ────────────────────────────────────────────────

interface DestroyCapableCompiler {
  destroy?(state: unknown): Promise<unknown>;
}

/**
 * Load the target compiler for destroy operations.
 */
function loadTargetCompiler(target: string): DestroyCapableCompiler {
  switch (target) {
    case 'local':
      return new LocalTargetCompiler() as unknown as DestroyCapableCompiler;
    default:
      throw new Error(`Unknown target: '${target}'`);
  }
}

// ─── Error Handling ─────────────────────────────────────────────────────────

function handleDestroyError(err: unknown): never {
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
