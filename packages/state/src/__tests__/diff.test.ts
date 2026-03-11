import { describe, it, expect } from 'vitest';
import { computeDiff } from '../diff.js';
import type { AssemblyResource } from '../diff.js';
import type { StateFile } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal valid StateFile for testing. */
function makeState(
  resources: StateFile['resources'] = {},
  overrides: Partial<StateFile> = {},
): StateFile {
  return {
    version: 1,
    target: 'local',
    resources,
    metadata: {
      lastBuildAt: '2026-01-01T00:00:00.000Z',
      assemblyHash: 'sha256:abc',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeDiff', () => {
  // -----------------------------------------------------------------------
  // Brand-new deployment (empty state)
  // -----------------------------------------------------------------------

  describe('brand-new deployment (all added)', () => {
    it('treats all assembly resources as added when state has no resources', () => {
      const assembly: Record<string, AssemblyResource> = {
        'Stack/Agent1': { type: 'agentforge::core::Agent', hash: 'sha256:aaa' },
        'Stack/Agent2': { type: 'agentforge::core::Agent', hash: 'sha256:bbb' },
      };
      const state = makeState({});

      const diff = computeDiff(assembly, state);

      expect(diff.added).toHaveLength(2);
      expect(diff.changed).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(0);

      // Verify added entries have correct shape
      const agent1 = diff.added.find((r) => r.id === 'Stack/Agent1');
      expect(agent1).toBeDefined();
      expect(agent1!.action).toBe('add');
      expect(agent1!.newHash).toBe('sha256:aaa');
      expect(agent1!.oldHash).toBeUndefined();
      expect(agent1!.type).toBe('agentforge::core::Agent');
    });

    it('works with a single resource', () => {
      const assembly: Record<string, AssemblyResource> = {
        'Stack/Solo': { type: 'agentforge::core::Tool', hash: 'sha256:solo' },
      };
      const state = makeState({});
      const diff = computeDiff(assembly, state);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0]!.id).toBe('Stack/Solo');
    });
  });

  // -----------------------------------------------------------------------
  // No changes (all unchanged)
  // -----------------------------------------------------------------------

  describe('no changes (all unchanged)', () => {
    it('reports all resources as unchanged when hashes match', () => {
      const assembly: Record<string, AssemblyResource> = {
        'Stack/Agent1': { type: 'agentforge::core::Agent', hash: 'sha256:aaa' },
        'Stack/Tool1': { type: 'agentforge::core::Tool', hash: 'sha256:bbb' },
      };
      const state = makeState({
        'Stack/Agent1': {
          type: 'agentforge::core::Agent',
          id: 'Stack/Agent1',
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:aaa',
          outputs: {},
        },
        'Stack/Tool1': {
          type: 'agentforge::core::Tool',
          id: 'Stack/Tool1',
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:bbb',
          outputs: {},
        },
      });

      const diff = computeDiff(assembly, state);

      expect(diff.added).toHaveLength(0);
      expect(diff.changed).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.unchanged).toEqual(
        expect.arrayContaining(['Stack/Agent1', 'Stack/Tool1']),
      );
      expect(diff.unchanged).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // All removed
  // -----------------------------------------------------------------------

  describe('full teardown (all removed)', () => {
    it('treats all state resources as removed when assembly is empty', () => {
      const assembly: Record<string, AssemblyResource> = {};
      const state = makeState({
        'Stack/Agent1': {
          type: 'agentforge::core::Agent',
          id: 'Stack/Agent1',
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:aaa',
          outputs: { endpoint: 'http://localhost:3000' },
        },
      });

      const diff = computeDiff(assembly, state);

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0]!.id).toBe('Stack/Agent1');
      expect(diff.removed[0]!.action).toBe('remove');
      expect(diff.removed[0]!.oldHash).toBe('sha256:aaa');
      expect(diff.removed[0]!.newHash).toBeUndefined();
      expect(diff.added).toHaveLength(0);
      expect(diff.changed).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Changed resources
  // -----------------------------------------------------------------------

  describe('changed resources', () => {
    it('detects a hash change as a changed resource', () => {
      const assembly: Record<string, AssemblyResource> = {
        'Stack/Agent1': { type: 'agentforge::core::Agent', hash: 'sha256:new-hash' },
      };
      const state = makeState({
        'Stack/Agent1': {
          type: 'agentforge::core::Agent',
          id: 'Stack/Agent1',
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:old-hash',
          outputs: {},
        },
      });

      const diff = computeDiff(assembly, state);

      expect(diff.changed).toHaveLength(1);
      expect(diff.changed[0]).toEqual({
        id: 'Stack/Agent1',
        type: 'agentforge::core::Agent',
        action: 'change',
        oldHash: 'sha256:old-hash',
        newHash: 'sha256:new-hash',
      });
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Mixed scenarios
  // -----------------------------------------------------------------------

  describe('mixed changes', () => {
    it('correctly categorises a mix of added, changed, removed, and unchanged', () => {
      const assembly: Record<string, AssemblyResource> = {
        'Stack/Unchanged': { type: 'agentforge::core::Agent', hash: 'sha256:same' },
        'Stack/Changed': { type: 'agentforge::core::Agent', hash: 'sha256:v2' },
        'Stack/NewAgent': { type: 'agentforge::core::Tool', hash: 'sha256:brand-new' },
      };
      const state = makeState({
        'Stack/Unchanged': {
          type: 'agentforge::core::Agent',
          id: 'Stack/Unchanged',
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:same',
          outputs: {},
        },
        'Stack/Changed': {
          type: 'agentforge::core::Agent',
          id: 'Stack/Changed',
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:v1',
          outputs: {},
        },
        'Stack/Removed': {
          type: 'agentforge::core::Tool',
          id: 'Stack/Removed',
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:gone',
          outputs: {},
        },
      });

      const diff = computeDiff(assembly, state);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0]!.id).toBe('Stack/NewAgent');
      expect(diff.added[0]!.action).toBe('add');

      expect(diff.changed).toHaveLength(1);
      expect(diff.changed[0]!.id).toBe('Stack/Changed');
      expect(diff.changed[0]!.oldHash).toBe('sha256:v1');
      expect(diff.changed[0]!.newHash).toBe('sha256:v2');

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0]!.id).toBe('Stack/Removed');

      expect(diff.unchanged).toEqual(['Stack/Unchanged']);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty assembly and empty state', () => {
      const diff = computeDiff({}, makeState({}));

      expect(diff.added).toHaveLength(0);
      expect(diff.changed).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(0);
    });

    it('uses the assembly type for added and changed entries', () => {
      const assembly: Record<string, AssemblyResource> = {
        'Stack/A': { type: 'agentforge::core::ToolV2', hash: 'sha256:new' },
      };
      const state = makeState({
        'Stack/A': {
          type: 'agentforge::core::Tool',
          id: 'Stack/A',
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:old',
          outputs: {},
        },
      });

      const diff = computeDiff(assembly, state);
      // The type should come from the assembly, not from the state
      expect(diff.changed[0]!.type).toBe('agentforge::core::ToolV2');
    });

    it('uses the state type for removed entries', () => {
      const assembly: Record<string, AssemblyResource> = {};
      const state = makeState({
        'Stack/A': {
          type: 'agentforge::core::LegacyTool',
          id: 'Stack/A',
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:old',
          outputs: {},
        },
      });

      const diff = computeDiff(assembly, state);
      expect(diff.removed[0]!.type).toBe('agentforge::core::LegacyTool');
    });

    it('handles resources with failed status in state', () => {
      const assembly: Record<string, AssemblyResource> = {
        'Stack/FailedAgent': { type: 'agentforge::core::Agent', hash: 'sha256:retry' },
      };
      const state = makeState({
        'Stack/FailedAgent': {
          type: 'agentforge::core::Agent',
          id: 'Stack/FailedAgent',
          status: 'failed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: 'sha256:different',
          outputs: {},
        },
      });

      const diff = computeDiff(assembly, state);
      // Hash is different, so it should show as changed
      expect(diff.changed).toHaveLength(1);
      expect(diff.changed[0]!.id).toBe('Stack/FailedAgent');
    });

    it('handles large number of resources', () => {
      const assembly: Record<string, AssemblyResource> = {};
      const resources: StateFile['resources'] = {};

      for (let i = 0; i < 100; i++) {
        const id = `Stack/Agent${i}`;
        assembly[id] = { type: 'agentforge::core::Agent', hash: `sha256:hash${i}` };
        resources[id] = {
          type: 'agentforge::core::Agent',
          id,
          status: 'deployed',
          lastDeployedAt: '2026-01-01T00:00:00.000Z',
          lastAssemblyHash: `sha256:hash${i}`,
          outputs: {},
        };
      }

      const diff = computeDiff(assembly, makeState(resources));

      expect(diff.unchanged).toHaveLength(100);
      expect(diff.added).toHaveLength(0);
      expect(diff.changed).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });
  });
});
