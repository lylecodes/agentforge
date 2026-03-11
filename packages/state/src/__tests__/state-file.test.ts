import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { StateManager } from '../state-file.js';
import type { StateFile, StateResource } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(tmpdir(), `agentforge-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeResource(overrides: Partial<StateResource> = {}): StateResource {
  return {
    type: 'agentforge::core::Agent',
    id: 'Stack/Agent1',
    status: 'deployed',
    lastDeployedAt: '2026-01-01T00:00:00.000Z',
    lastAssemblyHash: 'sha256:abc123',
    outputs: {},
    ...overrides,
  };
}

function makeStateFile(overrides: Partial<StateFile> = {}): StateFile {
  return {
    version: 1,
    target: 'local',
    resources: {},
    metadata: {
      lastBuildAt: '2026-01-01T00:00:00.000Z',
      assemblyHash: 'sha256:assembly-hash',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StateManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Constructor & file path
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('computes the correct file path for a target', () => {
      const mgr = new StateManager(tmpDir, 'local');
      expect(mgr.filePath).toBe(join(tmpDir, '.agentforge', 'state-local.json'));
    });

    it('uses the target name in the file path', () => {
      const mgr = new StateManager(tmpDir, 'docker');
      expect(mgr.filePath).toBe(join(tmpDir, '.agentforge', 'state-docker.json'));
    });

    it('creates per-target state files for different targets', () => {
      const local = new StateManager(tmpDir, 'local');
      const docker = new StateManager(tmpDir, 'docker');
      expect(local.filePath).not.toBe(docker.filePath);
    });
  });

  // -----------------------------------------------------------------------
  // exists()
  // -----------------------------------------------------------------------

  describe('exists', () => {
    it('returns false when no state file has been written', () => {
      const mgr = new StateManager(tmpDir, 'local');
      expect(mgr.exists()).toBe(false);
    });

    it('returns true after writing a state file', () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(makeStateFile());
      expect(mgr.exists()).toBe(true);
    });

    it('returns false after clearing a state file', () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(makeStateFile());
      mgr.clear();
      expect(mgr.exists()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // read()
  // -----------------------------------------------------------------------

  describe('read', () => {
    it('returns null when state file does not exist', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      const state = await mgr.read();
      expect(state).toBeNull();
    });

    it('returns the state file contents after write', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      const original = makeStateFile({
        resources: {
          'Stack/Agent1': makeResource(),
        },
      });
      mgr.write(original);

      const state = await mgr.read();
      expect(state).toEqual(original);
    });

    it('parses all fields correctly', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      const original = makeStateFile({
        target: 'local',
        resources: {
          'Stack/Agent1': makeResource({
            outputs: { endpoint: 'http://localhost:3000' },
          }),
        },
        metadata: {
          lastBuildAt: '2026-03-10T12:00:00.000Z',
          assemblyHash: 'sha256:full-hash',
        },
      });
      mgr.write(original);

      const state = await mgr.read();
      expect(state!.version).toBe(1);
      expect(state!.target).toBe('local');
      expect(state!.resources['Stack/Agent1']!.outputs.endpoint).toBe(
        'http://localhost:3000',
      );
      expect(state!.metadata.assemblyHash).toBe('sha256:full-hash');
    });

    it('throws on corrupt state file (invalid JSON)', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      // Manually write garbage to the file path
      const dir = join(tmpDir, '.agentforge');
      mkdirSync(dir, { recursive: true });
      writeFileSync(mgr.filePath, '{ this is not valid json !!!', 'utf8');

      await expect(mgr.read()).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // write() — atomic writes
  // -----------------------------------------------------------------------

  describe('write', () => {
    it('creates the .agentforge directory if it does not exist', () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(makeStateFile());

      expect(existsSync(join(tmpDir, '.agentforge'))).toBe(true);
      expect(existsSync(mgr.filePath)).toBe(true);
    });

    it('writes valid JSON to disk', () => {
      const mgr = new StateManager(tmpDir, 'local');
      const state = makeStateFile();
      mgr.write(state);

      const raw = readFileSync(mgr.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed).toEqual(state);
    });

    it('writes pretty-printed JSON with a trailing newline', () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(makeStateFile());

      const raw = readFileSync(mgr.filePath, 'utf8');
      // Pretty-printed means it has newlines and indentation
      expect(raw).toContain('\n');
      expect(raw.endsWith('\n')).toBe(true);
      // Two-space indentation
      expect(raw).toContain('  "version"');
    });

    it('overwrites existing state file contents', async () => {
      const mgr = new StateManager(tmpDir, 'local');

      const v1 = makeStateFile({ resources: {} });
      mgr.write(v1);

      const v2 = makeStateFile({
        resources: { 'Stack/New': makeResource({ id: 'Stack/New' }) },
      });
      mgr.write(v2);

      const state = await mgr.read();
      expect(state!.resources['Stack/New']).toBeDefined();
      expect(Object.keys(state!.resources)).toHaveLength(1);
    });

    it('does not leave temp files on successful write', () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(makeStateFile());

      const dir = join(tmpDir, '.agentforge');
      const files = require('fs').readdirSync(dir) as string[];
      const tmpFiles = files.filter((f: string) => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Per-target isolation
  // -----------------------------------------------------------------------

  describe('per-target state files', () => {
    it('different targets have independent state', async () => {
      const local = new StateManager(tmpDir, 'local');
      const docker = new StateManager(tmpDir, 'docker');

      local.write(
        makeStateFile({
          target: 'local',
          resources: { 'Stack/Local': makeResource({ id: 'Stack/Local' }) },
        }),
      );
      docker.write(
        makeStateFile({
          target: 'docker',
          resources: { 'Stack/Docker': makeResource({ id: 'Stack/Docker' }) },
        }),
      );

      const localState = await local.read();
      const dockerState = await docker.read();

      expect(localState!.target).toBe('local');
      expect(localState!.resources['Stack/Local']).toBeDefined();
      expect(localState!.resources['Stack/Docker']).toBeUndefined();

      expect(dockerState!.target).toBe('docker');
      expect(dockerState!.resources['Stack/Docker']).toBeDefined();
      expect(dockerState!.resources['Stack/Local']).toBeUndefined();
    });

    it('clearing one target does not affect the other', async () => {
      const local = new StateManager(tmpDir, 'local');
      const docker = new StateManager(tmpDir, 'docker');

      local.write(makeStateFile({ target: 'local' }));
      docker.write(makeStateFile({ target: 'docker' }));

      local.clear();

      expect(local.exists()).toBe(false);
      expect(docker.exists()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getResource()
  // -----------------------------------------------------------------------

  describe('getResource', () => {
    it('returns null when state file does not exist', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      const resource = await mgr.getResource('Stack/Agent1');
      expect(resource).toBeNull();
    });

    it('returns null when resource is not in the state file', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(makeStateFile());
      const resource = await mgr.getResource('Stack/NonExistent');
      expect(resource).toBeNull();
    });

    it('returns the resource when it exists', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      const res = makeResource({ id: 'Stack/Agent1' });
      mgr.write(makeStateFile({ resources: { 'Stack/Agent1': res } }));

      const result = await mgr.getResource('Stack/Agent1');
      expect(result).toEqual(res);
    });
  });

  // -----------------------------------------------------------------------
  // setResource()
  // -----------------------------------------------------------------------

  describe('setResource', () => {
    it('creates a new state file if none exists', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      expect(mgr.exists()).toBe(false);

      const res = makeResource({ id: 'Stack/Agent1' });
      await mgr.setResource('Stack/Agent1', res);

      expect(mgr.exists()).toBe(true);
      const state = await mgr.read();
      expect(state!.resources['Stack/Agent1']).toEqual(res);
      expect(state!.version).toBe(1);
    });

    it('adds a resource to an existing state file', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      const res1 = makeResource({ id: 'Stack/Agent1' });
      mgr.write(makeStateFile({ resources: { 'Stack/Agent1': res1 } }));

      const res2 = makeResource({ id: 'Stack/Agent2', type: 'agentforge::core::Tool' });
      await mgr.setResource('Stack/Agent2', res2);

      const state = await mgr.read();
      expect(Object.keys(state!.resources)).toHaveLength(2);
      expect(state!.resources['Stack/Agent2']).toEqual(res2);
    });

    it('updates an existing resource', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      const original = makeResource({
        id: 'Stack/Agent1',
        lastAssemblyHash: 'sha256:v1',
      });
      mgr.write(makeStateFile({ resources: { 'Stack/Agent1': original } }));

      const updated = makeResource({
        id: 'Stack/Agent1',
        lastAssemblyHash: 'sha256:v2',
        outputs: { endpoint: 'http://localhost:4000' },
      });
      await mgr.setResource('Stack/Agent1', updated);

      const state = await mgr.read();
      expect(state!.resources['Stack/Agent1']!.lastAssemblyHash).toBe('sha256:v2');
      expect(state!.resources['Stack/Agent1']!.outputs.endpoint).toBe(
        'http://localhost:4000',
      );
    });
  });

  // -----------------------------------------------------------------------
  // removeResource()
  // -----------------------------------------------------------------------

  describe('removeResource', () => {
    it('is a no-op when state file does not exist', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      // Should not throw
      await mgr.removeResource('Stack/Agent1');
      expect(mgr.exists()).toBe(false);
    });

    it('removes the specified resource from state', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(
        makeStateFile({
          resources: {
            'Stack/Agent1': makeResource({ id: 'Stack/Agent1' }),
            'Stack/Agent2': makeResource({ id: 'Stack/Agent2' }),
          },
        }),
      );

      await mgr.removeResource('Stack/Agent1');

      const state = await mgr.read();
      expect(state!.resources['Stack/Agent1']).toBeUndefined();
      expect(state!.resources['Stack/Agent2']).toBeDefined();
    });

    it('is a no-op when resource does not exist in state', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(
        makeStateFile({
          resources: { 'Stack/Agent1': makeResource({ id: 'Stack/Agent1' }) },
        }),
      );

      await mgr.removeResource('Stack/NonExistent');

      const state = await mgr.read();
      expect(Object.keys(state!.resources)).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // clear()
  // -----------------------------------------------------------------------

  describe('clear', () => {
    it('deletes the state file', () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(makeStateFile());
      expect(mgr.exists()).toBe(true);

      mgr.clear();
      expect(mgr.exists()).toBe(false);
    });

    it('is a no-op when no state file exists', () => {
      const mgr = new StateManager(tmpDir, 'local');
      // Should not throw
      expect(() => mgr.clear()).not.toThrow();
    });

    it('read returns null after clear', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      mgr.write(makeStateFile());
      mgr.clear();

      const state = await mgr.read();
      expect(state).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Round-trip integrity
  // -----------------------------------------------------------------------

  describe('round-trip integrity', () => {
    it('preserves all data through write -> read cycle', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      const state: StateFile = {
        version: 1,
        target: 'local',
        resources: {
          'DemoStack/Researcher': {
            type: 'agentforge::core::Agent',
            id: 'DemoStack/Researcher',
            status: 'deployed',
            lastDeployedAt: '2026-03-10T12:00:00.000Z',
            lastAssemblyHash: 'sha256:abc123def456',
            outputs: {
              endpoint: 'http://localhost:3000/agents/researcher',
              version: '1.0.0',
            },
          },
          'DemoStack/SearchTool': {
            type: 'agentforge::core::Tool',
            id: 'DemoStack/SearchTool',
            status: 'deployed',
            lastDeployedAt: '2026-03-10T12:00:00.000Z',
            lastAssemblyHash: 'sha256:xyz789',
            outputs: {},
          },
        },
        metadata: {
          lastBuildAt: '2026-03-10T12:00:00.000Z',
          assemblyHash: 'sha256:full-assembly-hash',
        },
      };

      mgr.write(state);
      const result = await mgr.read();
      expect(result).toEqual(state);
    });

    it('preserves resource statuses through round-trip', async () => {
      const mgr = new StateManager(tmpDir, 'local');
      const state = makeStateFile({
        resources: {
          'Stack/Deployed': makeResource({ status: 'deployed' }),
          'Stack/Failed': makeResource({ id: 'Stack/Failed', status: 'failed' }),
          'Stack/Destroying': makeResource({
            id: 'Stack/Destroying',
            status: 'destroying',
          }),
        },
      });

      mgr.write(state);
      const result = await mgr.read();

      expect(result!.resources['Stack/Deployed']!.status).toBe('deployed');
      expect(result!.resources['Stack/Failed']!.status).toBe('failed');
      expect(result!.resources['Stack/Destroying']!.status).toBe('destroying');
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent / sequential operations
  // -----------------------------------------------------------------------

  describe('sequential resource operations', () => {
    it('handles multiple sequential setResource calls', async () => {
      const mgr = new StateManager(tmpDir, 'local');

      for (let i = 0; i < 10; i++) {
        await mgr.setResource(
          `Stack/Agent${i}`,
          makeResource({ id: `Stack/Agent${i}`, lastAssemblyHash: `sha256:hash${i}` }),
        );
      }

      const state = await mgr.read();
      expect(Object.keys(state!.resources)).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(state!.resources[`Stack/Agent${i}`]!.lastAssemblyHash).toBe(
          `sha256:hash${i}`,
        );
      }
    });

    it('handles interleaved set and remove operations', async () => {
      const mgr = new StateManager(tmpDir, 'local');

      await mgr.setResource('Stack/A', makeResource({ id: 'Stack/A' }));
      await mgr.setResource('Stack/B', makeResource({ id: 'Stack/B' }));
      await mgr.removeResource('Stack/A');
      await mgr.setResource('Stack/C', makeResource({ id: 'Stack/C' }));

      const state = await mgr.read();
      expect(Object.keys(state!.resources)).toHaveLength(2);
      expect(state!.resources['Stack/A']).toBeUndefined();
      expect(state!.resources['Stack/B']).toBeDefined();
      expect(state!.resources['Stack/C']).toBeDefined();
    });
  });
});
