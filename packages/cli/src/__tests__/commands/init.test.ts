import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

/**
 * Tests for the `agentforge init` scaffolding logic.
 *
 * Since `runInit` is not exported directly, we test by importing and calling
 * `registerInitCommand` with a mock Commander program, then invoking the
 * action. However, the simpler approach is to simulate what `runInit` does
 * by calling it through the registered command's action handler.
 *
 * We use a real temp directory rather than mocking the filesystem, so we
 * can verify actual file contents on disk.
 */

// We need to intercept `process.exit` and `console.log` calls from the
// init command. We also need to set `process.cwd()` for the command.

let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = join(tmpdir(), `agentforge-init-test-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Helper: run init via Commander ──────────────────────────────────────────

/**
 * Import Commander and register the init command, then trigger it.
 * We capture output by spying on console.log/console.error.
 */
async function runInit(directory?: string): Promise<void> {
  // Dynamically import to avoid module caching issues between tests.
  const { Command } = await import('commander');
  const { registerInitCommand } = await import('../../commands/init.js');

  const program = new Command();
  program.exitOverride(); // Prevent process.exit in Commander

  registerInitCommand(program);

  // Suppress console output during tests.
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  try {
    const args = ['node', 'agentforge', 'init'];
    if (directory) args.push(directory);
    await program.parseAsync(args);
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

// ─── Init Tests ──────────────────────────────────────────────────────────────

describe('init command', () => {
  describe('scaffolding in current directory (no directory arg)', () => {
    it('creates package.json', async () => {
      await runInit();
      const pkgPath = join(tempDir, 'package.json');
      expect(existsSync(pkgPath)).toBe(true);

      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      expect(pkg.name).toBe('my-agent');
      expect(pkg.type).toBe('module');
      expect(pkg.private).toBe(true);
      expect(pkg.dependencies).toBeDefined();
      expect(pkg.dependencies['@agentforge/core']).toBeDefined();
    });

    it('creates agentforge.config.ts', async () => {
      await runInit();
      const configPath = join(tempDir, 'agentforge.config.ts');
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, 'utf8');
      expect(content).toContain("import type { AgentForgeConfig } from '@agentforge/cli'");
      expect(content).toContain('outDir');
      expect(content).toContain('defaultTarget');
      expect(content).toContain('export default config');
    });

    it('creates src/main.ts with defineAgent template', async () => {
      await runInit();
      const mainPath = join(tempDir, 'src', 'main.ts');
      expect(existsSync(mainPath)).toBe(true);

      const content = readFileSync(mainPath, 'utf8');
      expect(content).toContain("import { defineAgent } from '@agentforge/core'");
      expect(content).toContain('export default defineAgent');
      expect(content).toContain("name: 'my-agent'");
      expect(content).toContain('model:');
      expect(content).toContain('prompt:');
    });

    it('creates .gitignore with correct entries', async () => {
      await runInit();
      const gitignorePath = join(tempDir, '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);

      const content = readFileSync(gitignorePath, 'utf8');
      expect(content).toContain('agentforge.out/');
      expect(content).toContain('.agentforge/');
      expect(content).toContain('node_modules/');
      expect(content).toContain('dist/');
      expect(content).toContain('.env');
    });

    it('creates the src/ directory', async () => {
      await runInit();
      expect(existsSync(join(tempDir, 'src'))).toBe(true);
    });
  });

  describe('scaffolding in a named subdirectory', () => {
    it('creates all files inside the specified directory', async () => {
      await runInit('my-project');
      const projectDir = join(tempDir, 'my-project');

      expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'agentforge.config.ts'))).toBe(true);
      expect(existsSync(join(projectDir, 'src', 'main.ts'))).toBe(true);
      expect(existsSync(join(projectDir, '.gitignore'))).toBe(true);
    });

    it('uses the directory name as the package name', async () => {
      await runInit('awesome-agent');
      const pkgPath = join(tempDir, 'awesome-agent', 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      expect(pkg.name).toBe('awesome-agent');
    });
  });

  describe('package.json content', () => {
    it('includes correct scripts', async () => {
      await runInit();
      const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf8'));
      expect(pkg.scripts.build).toBe('agentforge build');
      expect(pkg.scripts.preview).toBe('agentforge preview');
      expect(pkg.scripts.deploy).toBe('agentforge deploy');
      expect(pkg.scripts.destroy).toBe('agentforge destroy');
    });

    it('sets version to 0.1.0', async () => {
      await runInit();
      const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf8'));
      expect(pkg.version).toBe('0.1.0');
    });

    it('has @agentforge/core as a dependency', async () => {
      await runInit();
      const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['@agentforge/core']).toBe('^0.1.0');
    });
  });

  describe('error handling', () => {
    it('exits when an agentforge project already exists (config.ts)', async () => {
      // Pre-create a config file to simulate an existing project.
      writeFileSync(join(tempDir, 'agentforge.config.ts'), 'export default {};', 'utf8');

      // The init command calls fatal() which calls process.exit(1).
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as never);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        await expect(runInit()).rejects.toThrow('process.exit called');
      } finally {
        exitSpy.mockRestore();
        errorSpy.mockRestore();
        logSpy.mockRestore();
      }
    });

    it('exits when an agentforge project already exists (config.js)', async () => {
      writeFileSync(join(tempDir, 'agentforge.config.js'), 'export default {};', 'utf8');

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as never);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        await expect(runInit()).rejects.toThrow('process.exit called');
      } finally {
        exitSpy.mockRestore();
        errorSpy.mockRestore();
        logSpy.mockRestore();
      }
    });
  });

  describe('config file content', () => {
    it('sets outDir to agentforge.out by default', async () => {
      await runInit();
      const content = readFileSync(join(tempDir, 'agentforge.config.ts'), 'utf8');
      expect(content).toContain("outDir: 'agentforge.out'");
    });

    it('sets defaultTarget to local by default', async () => {
      await runInit();
      const content = readFileSync(join(tempDir, 'agentforge.config.ts'), 'utf8');
      expect(content).toContain("defaultTarget: 'local'");
    });
  });

  describe('main.ts content', () => {
    it('uses anthropic/claude-sonnet-4 as default model', async () => {
      await runInit();
      const content = readFileSync(join(tempDir, 'src', 'main.ts'), 'utf8');
      expect(content).toContain('anthropic/claude-sonnet-4');
    });

    it('includes a default prompt', async () => {
      await runInit();
      const content = readFileSync(join(tempDir, 'src', 'main.ts'), 'utf8');
      expect(content).toContain('You are a helpful assistant.');
    });
  });
});
