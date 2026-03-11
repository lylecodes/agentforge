/**
 * @module commands/status
 *
 * `agentforge status` — Show deployed resources from the state file.
 *
 * Reads the persisted state file for the configured (or specified) target and
 * renders a formatted resource table.
 */

import type { Command } from 'commander';
import { StateManager } from '@agentforge/state';
import { loadConfig, resolveConfig } from '../config.js';
import { findProjectRoot } from '../project.js';
import { banner, fatal, formatStatus, info } from '../output.js';

// ─── Command Registration ───────────────────────────────────────────────────

/**
 * Register the `status` command on the given Commander program.
 *
 * @param program - The root Commander program instance.
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show deployed resources from state')
    .option('--target <name>', 'Deployment target to query')
    .action(async (options: { target?: string }) => {
      try {
        await runStatus(options);
      } catch (err) {
        fatal(err instanceof Error ? err.message : String(err));
      }
    });
}

// ─── Status Implementation ──────────────────────────────────────────────────

/**
 * Read and display the current deployment state.
 *
 * @param options - Command options including optional target override.
 */
async function runStatus(options: { target?: string }): Promise<void> {
  console.log(banner());
  console.log('');

  const projectDir = findProjectRoot();
  const config = resolveConfig(await loadConfig(projectDir));
  const target = options.target ?? config.defaultTarget;

  const stateManager = new StateManager(projectDir, target);
  const state = await stateManager.read();

  if (!state) {
    info(`No resources deployed (target: ${target}).`);
    info(`State file not found at ${stateManager.filePath}`);
    info('');
    info('Run `agentforge deploy` to deploy your agent system.');
    console.log('');
    return;
  }

  console.log(formatStatus(state));
  console.log('');
}
