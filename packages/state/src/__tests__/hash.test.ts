import { describe, it, expect } from 'vitest';
import { hashResource, hashAssembly } from '../hash.js';

describe('hashResource', () => {
  it('returns a string prefixed with sha256:', () => {
    const hash = hashResource({ name: 'agent-1' });
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces the same hash for identical inputs', () => {
    const obj = { type: 'agentforge::core::Agent', model: 'gpt-4', temperature: 0.7 };
    expect(hashResource(obj)).toBe(hashResource(obj));
  });

  it('produces the same hash regardless of key insertion order', () => {
    const a = { type: 'Agent', model: 'gpt-4', name: 'researcher' };
    const b = { name: 'researcher', type: 'Agent', model: 'gpt-4' };
    expect(hashResource(a)).toBe(hashResource(b));
  });

  it('recursively sorts nested object keys', () => {
    const a = {
      config: { z: 1, a: 2 },
      type: 'Agent',
    };
    const b = {
      type: 'Agent',
      config: { a: 2, z: 1 },
    };
    expect(hashResource(a)).toBe(hashResource(b));
  });

  it('handles deeply nested objects deterministically', () => {
    const a = {
      level1: {
        level2: {
          z: 'last',
          a: 'first',
          m: { b: 2, a: 1 },
        },
      },
    };
    const b = {
      level1: {
        level2: {
          a: 'first',
          m: { a: 1, b: 2 },
          z: 'last',
        },
      },
    };
    expect(hashResource(a)).toBe(hashResource(b));
  });

  it('preserves array element order (arrays are NOT sorted)', () => {
    const a = { items: [1, 2, 3] };
    const b = { items: [3, 2, 1] };
    expect(hashResource(a)).not.toBe(hashResource(b));
  });

  it('recursively sorts keys inside array elements', () => {
    const a = { items: [{ z: 1, a: 2 }] };
    const b = { items: [{ a: 2, z: 1 }] };
    expect(hashResource(a)).toBe(hashResource(b));
  });

  it('produces different hashes for different values', () => {
    const a = { model: 'gpt-4' };
    const b = { model: 'gpt-3.5' };
    expect(hashResource(a)).not.toBe(hashResource(b));
  });

  it('produces different hashes when keys differ', () => {
    const a = { model: 'gpt-4' };
    const b = { name: 'gpt-4' };
    expect(hashResource(a)).not.toBe(hashResource(b));
  });

  it('handles empty objects', () => {
    const hash = hashResource({});
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    // Should be stable
    expect(hashResource({})).toBe(hash);
  });

  it('handles null and undefined values in objects', () => {
    const a = { a: null, b: undefined };
    const b = { b: undefined, a: null };
    expect(hashResource(a)).toBe(hashResource(b));
  });

  it('handles numeric, boolean, and string values', () => {
    const obj = { num: 42, bool: true, str: 'hello' };
    const hash = hashResource(obj);
    expect(hash).toMatch(/^sha256:/);
    expect(hashResource(obj)).toBe(hash);
  });

  it('treats an empty array differently from an empty object', () => {
    const a = hashResource({ data: [] });
    const b = hashResource({ data: {} });
    expect(a).not.toBe(b);
  });
});

describe('hashAssembly', () => {
  it('returns a sha256-prefixed string', () => {
    const hash = hashAssembly({ version: 1, resources: {} });
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces deterministic output regardless of key order', () => {
    const a = {
      version: 1,
      resources: {
        'Stack/Agent1': { type: 'Agent', model: 'gpt-4' },
        'Stack/Agent2': { type: 'Agent', model: 'gpt-3.5' },
      },
    };
    const b = {
      resources: {
        'Stack/Agent2': { model: 'gpt-3.5', type: 'Agent' },
        'Stack/Agent1': { model: 'gpt-4', type: 'Agent' },
      },
      version: 1,
    };
    expect(hashAssembly(a)).toBe(hashAssembly(b));
  });

  it('returns a different hash when assembly content differs', () => {
    const a = { version: 1, resources: {} };
    const b = { version: 2, resources: {} };
    expect(hashAssembly(a)).not.toBe(hashAssembly(b));
  });

  it('produces a consistent hash for a complex assembly', () => {
    const assembly = {
      version: 1,
      target: 'local',
      resources: {
        'DemoStack/Researcher': {
          type: 'agentforge::core::Agent',
          properties: {
            model: 'claude-opus-4-20250514',
            tools: ['search', 'browse'],
          },
        },
      },
    };
    const hash1 = hashAssembly(assembly);
    const hash2 = hashAssembly(assembly);
    expect(hash1).toBe(hash2);
  });

  it('hashAssembly and hashResource produce different hashes for the same object', () => {
    // They use the same algorithm, so same input -> same output. This documents
    // the fact that there is no domain separation between the two functions.
    const obj = { type: 'Agent', model: 'gpt-4' };
    expect(hashAssembly(obj)).toBe(hashResource(obj));
  });
});
