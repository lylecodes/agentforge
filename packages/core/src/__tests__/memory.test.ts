import { describe, it, expect } from 'vitest';
import { App, Stack } from '@agentforge/constructs';
import { Memory, MemoryType } from '../memory.js';

describe('Memory', () => {
  function createStack() {
    const app = new App();
    return new Stack(app, 'Test');
  }

  describe('construction', () => {
    it('creates conversation buffer memory with defaults', () => {
      const stack = createStack();
      const memory = new Memory(stack, 'ConvMemory', {
        type: MemoryType.CONVERSATION,
        backend: 'sqlite',
      });
      expect(memory.memoryType).toBe(MemoryType.CONVERSATION);
      expect(memory.backend).toBe('sqlite');
    });

    it('creates summary memory with max tokens', () => {
      const stack = createStack();
      const memory = new Memory(stack, 'SumMemory', {
        type: MemoryType.SUMMARY,
        backend: 'sqlite',
        maxTokens: 4096,
      });
      expect(memory.memoryType).toBe(MemoryType.SUMMARY);
      expect(memory.maxTokens).toBe(4096);
    });

    it('creates entity memory', () => {
      const stack = createStack();
      const memory = new Memory(stack, 'EntityMem', {
        type: MemoryType.ENTITY,
        backend: 'redis',
        config: { host: 'localhost', port: 6379 },
      });
      expect(memory.memoryType).toBe(MemoryType.ENTITY);
      expect(memory.backend).toBe('redis');
    });

    it('has correct resource type', () => {
      const stack = createStack();
      const memory = new Memory(stack, 'Mem', {
        type: MemoryType.CONVERSATION,
        backend: 'sqlite',
      });
      expect(memory.resourceType).toBe('agentforge::core::Memory');
    });
  });

  describe('serialization', () => {
    it('serializes all properties', () => {
      const stack = createStack();
      const memory = new Memory(stack, 'Mem', {
        type: MemoryType.CONVERSATION,
        backend: 'sqlite',
        maxTokens: 2048,
        config: { dbPath: './data/memory.db' },
      });
      const assembly = memory.toAssemblyResource();
      expect(assembly.properties.type).toBe('conversation');
      expect(assembly.properties.backend).toBe('sqlite');
      expect(assembly.properties.maxTokens).toBe(2048);
      expect(assembly.properties.config).toEqual({ dbPath: './data/memory.db' });
    });

    it('omits optional properties when undefined', () => {
      const stack = createStack();
      const memory = new Memory(stack, 'Mem', {
        type: MemoryType.CONVERSATION,
        backend: 'sqlite',
      });
      const assembly = memory.toAssemblyResource();
      expect(assembly.properties.maxTokens).toBeUndefined();
      expect(assembly.properties.config).toBeUndefined();
    });
  });
});
