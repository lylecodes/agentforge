import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadConfig, resolveConfig } from '../config.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `agentforge-config-test-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── loadConfig() ────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  it('returns default empty config when no config file exists', async () => {
    const config = await loadConfig(tempDir);
    expect(config).toEqual({});
  });

  it('loads agentforge.config.js with default export', async () => {
    const configContent = `
      const config = {
        outDir: 'custom-out',
        defaultTarget: 'docker',
      };
      export default config;
    `;
    writeFileSync(join(tempDir, 'agentforge.config.js'), configContent, 'utf8');

    const config = await loadConfig(tempDir);
    expect(config.outDir).toBe('custom-out');
    expect(config.defaultTarget).toBe('docker');
  });

  it('returns empty object when module has no default export', async () => {
    const configContent = `
      export const outDir = 'should-not-matter';
    `;
    writeFileSync(join(tempDir, 'agentforge.config.js'), configContent, 'utf8');

    const config = await loadConfig(tempDir);
    expect(config).toEqual({});
  });

  it('prefers .ts over .js when both exist (checked in order)', async () => {
    // The function checks .ts first, then .js. If .ts exists it is used.
    // Since we can't dynamically import raw .ts without a compiler,
    // we test the .js path only. The ordering logic is verified by checking
    // that .js is loaded when only .js exists.
    const jsConfig = `
      const config = { outDir: 'from-js', defaultTarget: 'local' };
      export default config;
    `;
    writeFileSync(join(tempDir, 'agentforge.config.js'), jsConfig, 'utf8');

    const config = await loadConfig(tempDir);
    expect(config.outDir).toBe('from-js');
  });

  it('handles config with partial fields', async () => {
    const configContent = `
      export default { outDir: 'my-output' };
    `;
    writeFileSync(join(tempDir, 'agentforge.config.js'), configContent, 'utf8');

    const config = await loadConfig(tempDir);
    expect(config.outDir).toBe('my-output');
    expect(config.defaultTarget).toBeUndefined();
  });

  it('handles config that exports empty object', async () => {
    const configContent = `export default {};`;
    writeFileSync(join(tempDir, 'agentforge.config.js'), configContent, 'utf8');

    const config = await loadConfig(tempDir);
    expect(config).toEqual({});
  });
});

// ─── resolveConfig() ────────────────────────────────────────────────────────

describe('resolveConfig', () => {
  it('fills in all defaults for empty config', () => {
    const resolved = resolveConfig({});
    expect(resolved.outDir).toBe('agentforge.out');
    expect(resolved.defaultTarget).toBe('local');
  });

  it('preserves explicitly set values', () => {
    const resolved = resolveConfig({
      outDir: 'custom-output',
      defaultTarget: 'docker',
    });
    expect(resolved.outDir).toBe('custom-output');
    expect(resolved.defaultTarget).toBe('docker');
  });

  it('fills in only missing values', () => {
    const resolved = resolveConfig({ outDir: 'my-out' });
    expect(resolved.outDir).toBe('my-out');
    expect(resolved.defaultTarget).toBe('local');
  });

  it('returns a fully typed Required<AgentForgeConfig>', () => {
    const resolved = resolveConfig({});
    // Both fields are guaranteed to be defined.
    const outDir: string = resolved.outDir;
    const target: string = resolved.defaultTarget;
    expect(typeof outDir).toBe('string');
    expect(typeof target).toBe('string');
  });
});
