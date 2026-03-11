#!/usr/bin/env node

/**
 * @module @agentforge/cli
 *
 * AgentForge CLI — the command-line interface for building, previewing,
 * deploying, and managing AI agent systems defined as code.
 *
 * @example
 * ```bash
 * agentforge init my-agent
 * agentforge build
 * agentforge preview
 * agentforge deploy --target local
 * agentforge status
 * agentforge destroy
 * ```
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerBuildCommand } from './commands/build.js';
import { registerPreviewCommand } from './commands/preview.js';
import { registerDeployCommand } from './commands/deploy.js';
import { registerStatusCommand } from './commands/status.js';
import { registerDestroyCommand } from './commands/destroy.js';
import { registerDiffCommand } from './commands/diff.js';
import { fatal } from './output.js';

// Re-export public API for programmatic use and config file typing.
export type { AgentForgeConfig } from './config.js';

// ─── Program Setup ──────────────────────────────────────────────────────────

const program = new Command();

program
  .name('agentforge')
  .description('Infrastructure as Code for AI agents')
  .version('0.1.0', '-v, --version');

// ─── Register Commands ──────────────────────────────────────────────────────

registerInitCommand(program);
registerBuildCommand(program);
registerPreviewCommand(program);
registerDeployCommand(program);
registerStatusCommand(program);
registerDestroyCommand(program);
registerDiffCommand(program);

// ─── Error Handling ─────────────────────────────────────────────────────────

// Catch unhandled promise rejections from async command actions.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  fatal(`Unhandled error: ${message}`);
});

// ─── Parse ──────────────────────────────────────────────────────────────────

program.parse(process.argv);
