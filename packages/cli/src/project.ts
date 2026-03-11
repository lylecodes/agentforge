/**
 * @module project
 *
 * Project discovery and loading for AgentForge.
 *
 * Provides utilities to locate the project root directory and dynamically
 * import the user's application entry point.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ─── Type Imports ───────────────────────────────────────────────────────────

// The App class is provided by @agentforge/constructs. We reference it as a
// type here; the actual class is obtained via dynamic import from user code.
import type { BuildResult } from '@agentforge/constructs';

// ─── App Interface ──────────────────────────────────────────────────────────

/**
 * Minimal interface for the App object returned by the user's entry point.
 *
 * The real `App` class lives in `@agentforge/constructs`; we define this
 * structural type so the CLI can work with it without depending on the
 * concrete class at compile time.
 */
export interface App {
  /** Run the build (synthesis) phase and produce a BuildResult. */
  build(options?: { writeOutput?: boolean; throwOnError?: boolean }): BuildResult;
}

// ─── Project Discovery ─────────────────────────────────────────────────────

/**
 * Walk up from the current working directory to find the AgentForge project root.
 *
 * A directory is considered a project root if it contains:
 * - `agentforge.config.ts` or `agentforge.config.js`, OR
 * - a `package.json` with any `@agentforge/*` dependency.
 *
 * @returns Absolute path to the project root directory.
 * @throws If no project root is found before reaching the filesystem root.
 */
export function findProjectRoot(): string {
  let dir = resolve(process.cwd());

  while (true) {
    // Check for agentforge config files.
    if (
      existsSync(join(dir, 'agentforge.config.ts')) ||
      existsSync(join(dir, 'agentforge.config.js'))
    ) {
      return dir;
    }

    // Check for package.json with @agentforge dependencies.
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
        if (hasAgentForgeDeps(pkg)) {
          return dir;
        }
      } catch {
        // Malformed package.json — skip.
      }
    }

    // Move up one level.
    const parent = dirname(dir);
    if (parent === dir) {
      // Reached filesystem root without finding a project.
      throw new Error(
        'Could not find an AgentForge project root.\n' +
        'Ensure you are inside an AgentForge project or run `agentforge init` to create one.',
      );
    }
    dir = parent;
  }
}

// ─── App Loading ────────────────────────────────────────────────────────────

/**
 * Dynamically import the user's entry point and obtain the {@link App} instance.
 *
 * Looks for `src/main.ts` or `src/main.js` in the project directory.
 * The module is expected to either:
 * - Default-export an `App` instance (Tier 2/3 usage), or
 * - Default-export the result of `defineAgent()` (Tier 1 usage), which
 *   itself is an `App`.
 *
 * @param projectDir - Absolute path to the project root.
 * @returns The resolved {@link App} instance.
 * @throws If the entry point cannot be found or does not export an App.
 */
export async function loadApp(projectDir: string): Promise<App> {
  const entryNames = ['src/main.ts', 'src/main.js'];

  let entryPath: string | undefined;
  for (const name of entryNames) {
    const candidate = join(projectDir, name);
    if (existsSync(candidate)) {
      entryPath = candidate;
      break;
    }
  }

  if (!entryPath) {
    throw new Error(
      `Could not find entry point. Looked for:\n` +
      entryNames.map(n => `  - ${join(projectDir, n)}`).join('\n') +
      '\n\nCreate a src/main.ts file or run `agentforge init`.',
    );
  }

  const entryUrl = pathToFileURL(entryPath).href;
  const mod = await import(entryUrl) as { default?: App };

  if (!mod.default) {
    throw new Error(
      `Entry point ${entryPath} does not have a default export.\n` +
      'Export your App instance or defineAgent() result as the default export.',
    );
  }

  return mod.default;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Check whether a parsed `package.json` contains any `@agentforge/*` dependency.
 */
function hasAgentForgeDeps(pkg: Record<string, unknown>): boolean {
  const depSections = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

  for (const section of depSections) {
    const deps = pkg[section];
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps as Record<string, unknown>)) {
        if (name.startsWith('@agentforge/')) {
          return true;
        }
      }
    }
  }

  return false;
}
