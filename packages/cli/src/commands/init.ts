/**
 * @module commands/init
 *
 * `agentforge init` — Scaffold a new AgentForge project.
 *
 * Creates the project structure with:
 * - `package.json` (with `@agentforge/core` dependency)
 * - `agentforge.config.ts` (default configuration)
 * - `src/main.ts` (Tier 1 `defineAgent()` starter template)
 * - `.gitignore`
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Command } from 'commander';
import { banner, fatal, info, success } from '../output.js';

// ─── Command Registration ───────────────────────────────────────────────────

/**
 * Register the `init` command on the given Commander program.
 *
 * @param program - The root Commander program instance.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init [directory]')
    .description('Scaffold a new AgentForge project')
    .action(async (directory?: string) => {
      try {
        await runInit(directory);
      } catch (err) {
        fatal(err instanceof Error ? err.message : String(err));
      }
    });
}

// ─── Init Implementation ────────────────────────────────────────────────────

/**
 * Run the `init` scaffolding logic.
 *
 * @param directory - Optional target directory name. Defaults to the current
 *   working directory.
 */
async function runInit(directory?: string): Promise<void> {
  const projectDir = directory
    ? resolve(process.cwd(), directory)
    : process.cwd();

  const projectName = directory ?? 'my-agent';

  console.log(banner());
  console.log('');

  // Prevent overwriting existing projects.
  if (
    existsSync(join(projectDir, 'agentforge.config.ts')) ||
    existsSync(join(projectDir, 'agentforge.config.js'))
  ) {
    fatal(`An AgentForge project already exists in ${projectDir}.`);
  }

  // Create directories.
  mkdirSync(join(projectDir, 'src'), { recursive: true });

  // Write package.json.
  writeFileSync(
    join(projectDir, 'package.json'),
    generatePackageJson(projectName),
    'utf8',
  );
  success('Created package.json');

  // Write agentforge.config.ts.
  writeFileSync(
    join(projectDir, 'agentforge.config.ts'),
    generateConfig(),
    'utf8',
  );
  success('Created agentforge.config.ts');

  // Write src/main.ts.
  writeFileSync(
    join(projectDir, 'src/main.ts'),
    generateMainTs(),
    'utf8',
  );
  success('Created src/main.ts');

  // Write .gitignore.
  writeFileSync(
    join(projectDir, '.gitignore'),
    generateGitignore(),
    'utf8',
  );
  success('Created .gitignore');

  console.log('');
  info('Next steps:');
  if (directory) {
    info(`  cd ${directory}`);
  }
  info('  npm install');
  info('  agentforge build');
  info('  agentforge deploy');
  console.log('');
}

// ─── Template Generators ────────────────────────────────────────────────────

function generatePackageJson(name: string): string {
  const pkg = {
    name,
    version: '0.1.0',
    type: 'module',
    private: true,
    scripts: {
      build: 'agentforge build',
      preview: 'agentforge preview',
      deploy: 'agentforge deploy',
      destroy: 'agentforge destroy',
    },
    dependencies: {
      '@agentforge/core': '^0.1.0',
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

function generateConfig(): string {
  return `import type { AgentForgeConfig } from '@agentforge/cli';

const config: AgentForgeConfig = {
  outDir: 'agentforge.out',
  defaultTarget: 'local',
};

export default config;
`;
}

function generateMainTs(): string {
  return `import { defineAgent } from '@agentforge/core';

export default defineAgent({
  name: 'my-agent',
  model: 'anthropic/claude-sonnet-4',
  prompt: 'You are a helpful assistant.',
});
`;
}

function generateGitignore(): string {
  return `# AgentForge build output
agentforge.out/

# State files
.agentforge/

# Dependencies
node_modules/

# TypeScript
dist/
*.tsbuildinfo

# Environment
.env
.env.local
`;
}
