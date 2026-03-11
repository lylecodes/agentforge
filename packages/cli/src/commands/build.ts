/**
 * @module commands/build
 *
 * `agentforge build` — Build the agent assembly.
 *
 * Loads the user's project, imports the App, runs `app.build()`, and writes
 * the Agent Assembly output to `agentforge.out/`. Replaces the older "synth"
 * terminology with the universally understood "build".
 */

import { join } from 'node:path';
import type { Command } from 'commander';
import type { AgentAssembly, BuildResult } from '@agentforge/constructs';
import { loadConfig, resolveConfig } from '../config.js';
import { findProjectRoot, loadApp } from '../project.js';
import { banner, fatal, formatError, info, success } from '../output.js';

// ─── Command Registration ───────────────────────────────────────────────────

/**
 * Register the `build` command on the given Commander program.
 *
 * @param program - The root Commander program instance.
 */
export function registerBuildCommand(program: Command): void {
  program
    .command('build')
    .description('Build the agent assembly (produces agentforge.out/)')
    .action(async () => {
      try {
        await runBuild();
      } catch (err) {
        handleBuildError(err);
      }
    });
}

// ─── Build Implementation ───────────────────────────────────────────────────

/**
 * Execute the build pipeline.
 *
 * This is also called by `preview` and `deploy` to produce the assembly
 * before further processing.
 *
 * @returns The produced {@link AgentAssembly} (the first stack's assembly)
 *   and the project directory.
 */
export async function executeBuild(): Promise<{
  assembly: AgentAssembly;
  buildResult: BuildResult;
  projectDir: string;
  outDir: string;
}> {
  const projectDir = findProjectRoot();
  const config = resolveConfig(await loadConfig(projectDir));
  const outDir = join(projectDir, config.outDir);

  const app = await loadApp(projectDir);

  // App.build() writes output to outDir and returns a BuildResult.
  const buildResult = app.build({ writeOutput: true, throwOnError: true });

  // Extract the first stack's assembly for callers that need a single AgentAssembly.
  const stackNames = Object.keys(buildResult.stacks);
  if (stackNames.length === 0) {
    throw new Error(
      'Build produced no stacks. Ensure your App has at least one Stack with resources.',
    );
  }
  const assembly = buildResult.stacks[stackNames[0]!]!;

  return { assembly, buildResult, projectDir, outDir };
}

/**
 * Run the build command with user-facing output.
 */
async function runBuild(): Promise<void> {
  console.log(banner());
  console.log('');

  const startTime = Date.now();
  const { assembly, buildResult, outDir } = await executeBuild();

  const resourceCount = Object.keys(assembly.resources).length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  success(`Built ${resourceCount} resource${resourceCount === 1 ? '' : 's'} in ${elapsed}s`);
  info(`Assembly written to ${outDir}`);
  console.log('');
}

// ─── Error Handling ─────────────────────────────────────────────────────────

/**
 * Handle errors from the build pipeline, formatting AgentForge diagnostics
 * when available.
 */
function handleBuildError(err: unknown): never {
  // Check for AgentForgeError with a diagnostic property.
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
