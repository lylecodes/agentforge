/**
 * @module config
 *
 * Project configuration loading for AgentForge.
 *
 * Loads `agentforge.config.ts` (or `.js`) from the project root via dynamic
 * import. The configuration file is expected to default-export an object
 * conforming to {@link AgentForgeConfig}.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ─── Configuration Interface ────────────────────────────────────────────────

/**
 * User-facing project configuration.
 *
 * This is the shape of the default export in `agentforge.config.ts`.
 */
export interface AgentForgeConfig {
  /** Directory where build artifacts are written. Defaults to `'agentforge.out'`. */
  outDir?: string;

  /** Default deployment target name. Defaults to `'local'`. */
  defaultTarget?: string;
}

// ─── Config File Names ──────────────────────────────────────────────────────

/** Supported configuration file names, checked in order. */
const CONFIG_FILE_NAMES = [
  'agentforge.config.ts',
  'agentforge.config.js',
] as const;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load the AgentForge project configuration from disk.
 *
 * Looks for `agentforge.config.ts` or `agentforge.config.js` in
 * {@link projectDir} and dynamically imports it. If neither file exists a
 * default configuration is returned.
 *
 * @param projectDir - Absolute path to the project root.
 * @returns The resolved {@link AgentForgeConfig}.
 */
export async function loadConfig(projectDir: string): Promise<AgentForgeConfig> {
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = join(projectDir, fileName);
    if (existsSync(configPath)) {
      const configUrl = pathToFileURL(configPath).href;
      const mod = await import(configUrl) as { default?: AgentForgeConfig };
      return mod.default ?? {};
    }
  }

  // No config file found — return defaults.
  return {};
}

/**
 * Resolve a configuration to concrete values with defaults applied.
 *
 * @param config - The raw configuration (may have undefined fields).
 * @returns A fully-resolved configuration with all defaults filled in.
 */
export function resolveConfig(config: AgentForgeConfig): Required<AgentForgeConfig> {
  return {
    outDir: config.outDir ?? 'agentforge.out',
    defaultTarget: config.defaultTarget ?? 'local',
  };
}
