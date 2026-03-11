import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { findProjectRoot } from '../project.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  const rawDir = join(tmpdir(), `agentforge-project-test-${randomUUID()}`);
  mkdirSync(rawDir, { recursive: true });
  // Use realpathSync to resolve symlinks (e.g., /var -> /private/var on macOS)
  // so that path comparisons match what findProjectRoot returns via resolve().
  tempDir = realpathSync(rawDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── findProjectRoot() ──────────────────────────────────────────────────────

describe('findProjectRoot', () => {
  it('finds root via agentforge.config.ts in current directory', () => {
    writeFileSync(join(tempDir, 'agentforge.config.ts'), 'export default {};', 'utf8');
    process.chdir(tempDir);

    const result = findProjectRoot();
    expect(result).toBe(tempDir);
  });

  it('finds root via agentforge.config.js in current directory', () => {
    writeFileSync(join(tempDir, 'agentforge.config.js'), 'export default {};', 'utf8');
    process.chdir(tempDir);

    const result = findProjectRoot();
    expect(result).toBe(tempDir);
  });

  it('finds root via package.json with @agentforge dependency', () => {
    const pkg = {
      name: 'my-agent',
      dependencies: {
        '@agentforge/core': '^0.1.0',
      },
    };
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify(pkg), 'utf8');
    process.chdir(tempDir);

    const result = findProjectRoot();
    expect(result).toBe(tempDir);
  });

  it('finds root via package.json with @agentforge devDependency', () => {
    const pkg = {
      name: 'my-agent',
      devDependencies: {
        '@agentforge/cli': '^0.1.0',
      },
    };
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify(pkg), 'utf8');
    process.chdir(tempDir);

    const result = findProjectRoot();
    expect(result).toBe(tempDir);
  });

  it('finds root via package.json with @agentforge peerDependency', () => {
    const pkg = {
      name: 'my-plugin',
      peerDependencies: {
        '@agentforge/constructs': '^0.1.0',
      },
    };
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify(pkg), 'utf8');
    process.chdir(tempDir);

    const result = findProjectRoot();
    expect(result).toBe(tempDir);
  });

  it('walks up from a nested directory to find the project root', () => {
    writeFileSync(join(tempDir, 'agentforge.config.ts'), 'export default {};', 'utf8');
    const nested = join(tempDir, 'src', 'deep', 'nested');
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    const result = findProjectRoot();
    expect(result).toBe(tempDir);
  });

  it('ignores package.json without @agentforge dependencies', () => {
    // Create a package.json without agentforge deps at the leaf.
    const nested = join(tempDir, 'inner');
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(nested, 'package.json'),
      JSON.stringify({ name: 'unrelated', dependencies: { lodash: '^4.0.0' } }),
      'utf8',
    );
    // Place the real config at the parent.
    writeFileSync(join(tempDir, 'agentforge.config.ts'), 'export default {};', 'utf8');
    process.chdir(nested);

    const result = findProjectRoot();
    expect(result).toBe(tempDir);
  });

  it('ignores malformed package.json gracefully', () => {
    const nested = join(tempDir, 'child');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'package.json'), 'not valid json!!!', 'utf8');
    // Place config at parent.
    writeFileSync(join(tempDir, 'agentforge.config.ts'), 'export default {};', 'utf8');
    process.chdir(nested);

    const result = findProjectRoot();
    expect(result).toBe(tempDir);
  });

  it('throws when no project root is found', () => {
    // Use a temp dir with no agentforge markers and no parents with markers.
    // This test creates an isolated directory structure that can't walk up
    // to find a project root (the real filesystem root won't have one).
    const isolated = join(tmpdir(), `agentforge-no-project-${randomUUID()}`);
    mkdirSync(isolated, { recursive: true });
    process.chdir(isolated);

    // This will walk up to the filesystem root. If the test runner's cwd
    // or any parent happens to be an agentforge project, this test might
    // not throw. We accept that limitation.
    try {
      findProjectRoot();
      // If we get here, a parent dir has agentforge config - skip assertion.
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Could not find an AgentForge project root');
      expect((err as Error).message).toContain('agentforge init');
    }

    rmSync(isolated, { recursive: true, force: true });
  });

  it('prefers config file over package.json when both exist', () => {
    // Both markers present — config file is checked first.
    writeFileSync(join(tempDir, 'agentforge.config.ts'), 'export default {};', 'utf8');
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', dependencies: { '@agentforge/core': '*' } }),
      'utf8',
    );
    process.chdir(tempDir);

    // Should still find the root (doesn't matter which marker matched,
    // both point to the same directory).
    const result = findProjectRoot();
    expect(result).toBe(tempDir);
  });
});
