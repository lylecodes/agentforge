/**
 * @module output
 *
 * Pretty-printing and formatted output for the AgentForge CLI.
 *
 * All user-facing output flows through this module so that formatting,
 * coloring, and structure are consistent. Uses `picocolors` for terminal
 * colors — no ANSI escape codes appear elsewhere in the CLI.
 *
 * @see Section 2.10 of the AgentForge roadmap for error output design.
 */

import pc from 'picocolors';
import type { DiffResult, ResourceDiff, StateFile } from '@agentforge/state';
import type { AgentForgeDiagnostic } from '@agentforge/constructs';

// Re-export for convenience within the CLI.
export { pc };

// ─── Package version ────────────────────────────────────────────────────────

/** CLI version — sourced from package.json at build time. */
const CLI_VERSION = '0.1.0';

// ─── Banner ─────────────────────────────────────────────────────────────────

/**
 * Produce the AgentForge version banner string.
 *
 * @returns A styled banner line suitable for printing at the start of commands.
 */
export function banner(): string {
  return pc.bold(pc.cyan(`AgentForge v${CLI_VERSION}`));
}

// ─── Diff / Preview Formatting ──────────────────────────────────────────────

/**
 * Render a Terraform-style plan output from a {@link DiffResult}.
 *
 * Uses green `+` for additions, yellow `~` for changes, and red `-` for
 * removals.
 *
 * @param diff - The result of `computeDiff()`.
 * @returns A multi-line formatted string ready for terminal output.
 *
 * @example
 * ```
 * AgentForge Preview — 2 to add, 1 to change, 0 to destroy.
 *
 *   + agentforge::core::Agent        MyStack/Researcher
 *   + agentforge::core::Model        MyStack/Claude
 *   ~ agentforge::core::Tool         MyStack/WebSearch
 *     (handler changed)
 * ```
 */
export function formatDiff(diff: DiffResult): string {
  const addCount = diff.added.length;
  const changeCount = diff.changed.length;
  const removeCount = diff.removed.length;

  const lines: string[] = [];

  // Summary header.
  const summary = [
    addCount > 0 ? pc.green(`${addCount} to add`) : `${addCount} to add`,
    changeCount > 0 ? pc.yellow(`${changeCount} to change`) : `${changeCount} to change`,
    removeCount > 0 ? pc.red(`${removeCount} to destroy`) : `${removeCount} to destroy`,
  ].join(', ');

  lines.push(`${pc.bold('AgentForge Preview')} — ${summary}.`);
  lines.push('');

  // No changes.
  if (addCount === 0 && changeCount === 0 && removeCount === 0) {
    lines.push(pc.green('  No changes. Infrastructure is up-to-date.'));
    return lines.join('\n');
  }

  // Additions.
  for (const r of diff.added) {
    lines.push(formatResourceLine('+', r, pc.green));
  }

  // Changes.
  for (const r of diff.changed) {
    lines.push(formatResourceLine('~', r, pc.yellow));
    lines.push(pc.dim('      (properties changed)'));
  }

  // Removals.
  for (const r of diff.removed) {
    lines.push(formatResourceLine('-', r, pc.red));
  }

  return lines.join('\n');
}

/**
 * Format a single resource diff line with symbol, type, and id.
 */
function formatResourceLine(
  symbol: string,
  resource: ResourceDiff,
  colorFn: (s: string) => string,
): string {
  const typeStr = resource.type.padEnd(35);
  return colorFn(`  ${symbol} ${typeStr} ${resource.id}`);
}

// ─── Status Formatting ──────────────────────────────────────────────────────

/**
 * Render a formatted table of deployed resources from a state file.
 *
 * @param state - The persisted state file.
 * @returns A multi-line formatted string showing all deployed resources.
 */
export function formatStatus(state: StateFile): string {
  const resources = Object.values(state.resources);
  const lines: string[] = [];

  lines.push(pc.bold(`AgentForge Status — target: ${state.target}`));
  lines.push('');

  if (resources.length === 0) {
    lines.push(pc.dim('  No resources deployed.'));
    return lines.join('\n');
  }

  // Column headers.
  const headerType = 'Type'.padEnd(35);
  const headerID = 'ID'.padEnd(30);
  const headerStatus = 'Status'.padEnd(12);
  const headerDeployed = 'Last Deployed';

  lines.push(pc.dim(`  ${headerType} ${headerID} ${headerStatus} ${headerDeployed}`));
  lines.push(pc.dim(`  ${'─'.repeat(35)} ${'─'.repeat(30)} ${'─'.repeat(12)} ${'─'.repeat(20)}`));

  for (const resource of resources) {
    const type = resource.type.padEnd(35);
    const id = resource.id.padEnd(30);
    const statusColor = resource.status === 'deployed' ? pc.green : pc.red;
    const status = statusColor(resource.status.padEnd(12));
    const deployed = formatTimestamp(resource.lastDeployedAt);

    lines.push(`  ${type} ${id} ${status} ${deployed}`);

    // Show outputs if any.
    const outputEntries = Object.entries(resource.outputs);
    if (outputEntries.length > 0) {
      for (const [key, value] of outputEntries) {
        lines.push(pc.dim(`    ${key}: ${value}`));
      }
    }
  }

  lines.push('');
  lines.push(pc.bold(`  ${resources.length} resource${resources.length === 1 ? '' : 's'} deployed.`));

  return lines.join('\n');
}

// ─── Error Formatting ───────────────────────────────────────────────────────

/**
 * Render a structured error diagnostic for terminal output.
 *
 * Produces a formatted block with code, severity, message, construct path,
 * suggested fix, and documentation link — styled with colors for readability.
 *
 * @param diagnostic - The {@link AgentForgeDiagnostic} to format.
 * @returns A multi-line formatted error string.
 *
 * @example
 * ```
 * Error AF001: Missing required property 'model' on Agent 'MyStack/MyAgent'.
 *   at MyStack/MyAgent (properties.model)
 *   Fix: Add the 'model' property when constructing Agent.
 *   Docs: https://agentforge.dev/docs/errors/AF001
 * ```
 */
export function formatError(diagnostic: AgentForgeDiagnostic): string {
  const lines: string[] = [];

  // Severity-colored header.
  const severityColor = diagnostic.severity === 'error'
    ? pc.red
    : diagnostic.severity === 'warning'
      ? pc.yellow
      : pc.blue;

  const severityLabel = diagnostic.severity.charAt(0).toUpperCase() + diagnostic.severity.slice(1);
  lines.push(severityColor(`${severityLabel} ${pc.bold(diagnostic.code)}: ${diagnostic.message}`));

  // Construct path.
  if (diagnostic.constructPath) {
    const pathSuffix = diagnostic.propertyPath ? ` (${diagnostic.propertyPath})` : '';
    lines.push(pc.dim(`  at ${diagnostic.constructPath}${pathSuffix}`));
  }

  // Suggested fix.
  if (diagnostic.suggestedFix) {
    lines.push(pc.cyan(`  Fix: ${diagnostic.suggestedFix}`));
  }

  // Documentation link.
  if (diagnostic.docsUrl) {
    lines.push(pc.dim(`  Docs: ${diagnostic.docsUrl}`));
  }

  return lines.join('\n');
}

// ─── General Output Helpers ─────────────────────────────────────────────────

/**
 * Print a success message with a green checkmark prefix.
 *
 * @param message - The message to print.
 */
export function success(message: string): void {
  console.log(pc.green(`  ✓ ${message}`));
}

/**
 * Print a warning message with a yellow prefix.
 *
 * @param message - The message to print.
 */
export function warn(message: string): void {
  console.log(pc.yellow(`  ! ${message}`));
}

/**
 * Print an info message with a dim prefix.
 *
 * @param message - The message to print.
 */
export function info(message: string): void {
  console.log(pc.dim(`  ${message}`));
}

/**
 * Print an error message to stderr and exit with the given code.
 *
 * @param message - The error message.
 * @param exitCode - Process exit code (default: `1`).
 */
export function fatal(message: string, exitCode = 1): never {
  console.error(pc.red(`\nError: ${message}\n`));
  process.exit(exitCode);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Format an ISO 8601 timestamp to a human-friendly short form.
 */
function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString();
  } catch {
    return iso;
  }
}
