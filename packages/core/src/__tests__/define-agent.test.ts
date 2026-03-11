import { describe, it, expect } from 'vitest';
import { App, Stack } from '@agentforge/constructs';
import { defineAgent } from '../define-agent.js';
import { Agent } from '../agent.js';
import { Model } from '../model.js';
import { Tool } from '../tool.js';
import { Prompt } from '../prompt.js';
import { MCPServer } from '../mcp-server.js';
import { Memory, MemoryType } from '../memory.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Walk the construct tree and collect all AgentResourceBase descendants.
 * Uses the construct tree API to find children.
 */
function findConstructsByType<T>(app: App, ctor: new (...args: any[]) => T): T[] {
  const results: T[] = [];
  function walk(node: { node: { children: readonly any[] } }) {
    for (const child of node.node.children) {
      if (child instanceof ctor) {
        results.push(child);
      }
      if (child && typeof child === 'object' && 'node' in child) {
        walk(child);
      }
    }
  }
  walk(app);
  return results;
}

// ─── Basic Usage ─────────────────────────────────────────────────────────────

describe('defineAgent', () => {
  describe('basic usage', () => {
    it('returns an App instance', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a research assistant.',
      });

      expect(app).toBeInstanceOf(App);
    });

    it('creates a Stack with a PascalCase name', () => {
      const app = defineAgent({
        name: 'my-research-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a research assistant.',
      });

      // The Stack should be a child of the app
      const stacks = app.node.children.filter(
        (c) => c instanceof Stack
      ) as Stack[];
      expect(stacks).toHaveLength(1);
      expect(stacks[0].node.id).toBe('MyResearchAgent');
    });

    it('creates a Model from a shorthand string', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a research assistant.',
      });

      const models = findConstructsByType(app, Model);
      expect(models).toHaveLength(1);
      expect(models[0].provider).toBe('anthropic');
      expect(models[0].modelId).toBe('claude-sonnet-4');
    });

    it('auto-sets the default API key for known providers', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a research assistant.',
      });

      const models = findConstructsByType(app, Model);
      expect(models[0].apiKey).toBeDefined();
      expect(models[0].apiKey?.name).toBe('ANTHROPIC_API_KEY');
    });

    it('creates an Agent construct with the given name', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a research assistant.',
      });

      const agents = findConstructsByType(app, Agent);
      expect(agents).toHaveLength(1);
      expect(agents[0].agentName).toBe('researcher');
    });

    it('creates a Prompt from the prompt string', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a research assistant.',
      });

      // The string prompt is auto-created as a child of the Agent
      const agents = findConstructsByType(app, Agent);
      expect(agents[0].prompt).toBeDefined();
      expect(agents[0].prompt).toBeInstanceOf(Prompt);
      expect(agents[0].prompt!.content).toBe('You are a research assistant.');
    });
  });

  // ─── Model Shorthand Parsing ────────────────────────────────────────────────

  describe('model shorthand parsing', () => {
    it('parses anthropic/model-id correctly', () => {
      const app = defineAgent({
        name: 'test',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
      });

      const models = findConstructsByType(app, Model);
      expect(models[0].provider).toBe('anthropic');
      expect(models[0].modelId).toBe('claude-sonnet-4');
    });

    it('parses openai/model-id correctly', () => {
      const app = defineAgent({
        name: 'test',
        model: 'openai/gpt-4o',
        prompt: 'Hi.',
      });

      const models = findConstructsByType(app, Model);
      expect(models[0].provider).toBe('openai');
      expect(models[0].modelId).toBe('gpt-4o');
      expect(models[0].apiKey?.name).toBe('OPENAI_API_KEY');
    });

    it('parses google/model-id correctly', () => {
      const app = defineAgent({
        name: 'test',
        model: 'google/gemini-2.0-flash',
        prompt: 'Hi.',
      });

      const models = findConstructsByType(app, Model);
      expect(models[0].provider).toBe('google');
      expect(models[0].modelId).toBe('gemini-2.0-flash');
      expect(models[0].apiKey?.name).toBe('GOOGLE_API_KEY');
    });

    it('handles unknown providers (no default API key)', () => {
      const app = defineAgent({
        name: 'test',
        model: 'custom-provider/my-model',
        prompt: 'Hi.',
      });

      const models = findConstructsByType(app, Model);
      expect(models[0].provider).toBe('custom-provider');
      expect(models[0].modelId).toBe('my-model');
      expect(models[0].apiKey).toBeUndefined();
    });

    it('throws on invalid model shorthand (missing slash)', () => {
      expect(() => {
        defineAgent({
          name: 'test',
          model: 'invalid-no-slash',
          prompt: 'Hi.',
        });
      }).toThrow('Invalid model shorthand');
    });
  });

  // ─── Full ModelProps ────────────────────────────────────────────────────────

  describe('full ModelProps', () => {
    it('accepts a full ModelProps object', () => {
      const app = defineAgent({
        name: 'test',
        model: {
          provider: 'anthropic',
          modelId: 'claude-opus-4',
          temperature: 0.3,
          maxTokens: 8192,
        },
        prompt: 'Hi.',
      });

      const models = findConstructsByType(app, Model);
      expect(models[0].provider).toBe('anthropic');
      expect(models[0].modelId).toBe('claude-opus-4');
      expect(models[0].temperature).toBe(0.3);
      expect(models[0].maxTokens).toBe(8192);
    });
  });

  // ─── Tools ─────────────────────────────────────────────────────────────────

  describe('tools', () => {
    it('creates Tool constructs from inline tool definitions', () => {
      const handler = async () => 'result';
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        tools: [
          {
            name: 'web_search',
            description: 'Search the web',
            handler,
          },
        ],
      });

      const tools = findConstructsByType(app, Tool);
      expect(tools).toHaveLength(1);
      expect(tools[0].toolName).toBe('web_search');
      expect(tools[0].description).toBe('Search the web');
      expect(tools[0].handler.type).toBe('inline');
    });

    it('creates multiple tools', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        tools: [
          {
            name: 'web_search',
            description: 'Search the web',
            handler: async () => 'result',
          },
          {
            name: 'file_read',
            description: 'Read a file',
            handler: async () => 'content',
          },
        ],
      });

      const tools = findConstructsByType(app, Tool);
      expect(tools).toHaveLength(2);
    });

    it('uses PascalCase tool names as construct IDs', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        tools: [
          {
            name: 'web_search',
            description: 'Search the web',
            handler: async () => 'result',
          },
        ],
      });

      const tools = findConstructsByType(app, Tool);
      expect(tools[0].node.id).toBe('WebSearch');
    });

    it('accepts full ToolProps with file handler', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        tools: [
          {
            name: 'file_search',
            description: 'Search files',
            handler: { file: './tools/search.ts', export: 'default' },
          },
        ],
      });

      const tools = findConstructsByType(app, Tool);
      expect(tools[0].handler.type).toBe('file');
    });
  });

  // ─── MCP Servers ───────────────────────────────────────────────────────────

  describe('mcpServers', () => {
    it('creates MCPServer constructs', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        mcpServers: [
          {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@mcp/server-filesystem', './workspace'],
          },
        ],
      });

      const servers = findConstructsByType(app, MCPServer);
      expect(servers).toHaveLength(1);
      expect(servers[0].transport).toBe('stdio');
      expect(servers[0].command).toBe('npx');
      expect(servers[0].args).toEqual(['-y', '@mcp/server-filesystem', './workspace']);
    });

    it('creates multiple MCP servers with indexed IDs', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        mcpServers: [
          { transport: 'stdio', command: 'npx', args: ['server1'] },
          { transport: 'stdio', command: 'node', args: ['server2.js'] },
        ],
      });

      const servers = findConstructsByType(app, MCPServer);
      expect(servers).toHaveLength(2);
      expect(servers[0].node.id).toBe('MCPServer0');
      expect(servers[1].node.id).toBe('MCPServer1');
    });
  });

  // ─── Memory ─────────────────────────────────────────────────────────────────

  describe('memory', () => {
    it('creates a Memory construct when memory option is provided', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        memory: {
          type: MemoryType.CONVERSATION,
          backend: 'sqlite',
        },
      });

      const memories = findConstructsByType(app, Memory);
      expect(memories).toHaveLength(1);
      expect(memories[0].memoryType).toBe(MemoryType.CONVERSATION);
      expect(memories[0].backend).toBe('sqlite');
    });

    it('attaches memory to the agent via addMemory', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        memory: {
          type: MemoryType.SUMMARY,
          backend: 'redis',
          maxTokens: 4096,
        },
      });

      const agents = findConstructsByType(app, Agent);
      expect(agents[0].memory).toBeDefined();
      expect(agents[0].memory).toBeInstanceOf(Memory);
      expect(agents[0].memory!.memoryType).toBe(MemoryType.SUMMARY);
      expect(agents[0].memory!.backend).toBe('redis');
      expect(agents[0].memory!.maxTokens).toBe(4096);
    });

    it('does not create Memory when memory option is omitted', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
      });

      const memories = findConstructsByType(app, Memory);
      expect(memories).toHaveLength(0);

      const agents = findConstructsByType(app, Agent);
      expect(agents[0].memory).toBeUndefined();
    });

    it('memory appears in assembly output', () => {
      const app = defineAgent({
        name: 'memory-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        memory: {
          type: MemoryType.BUFFER,
          backend: 'postgres',
          maxTokens: 2048,
          config: { connectionString: 'postgres://localhost:5432/db' },
        },
      });

      const result = app.build({ writeOutput: false, throwOnError: false });
      const assembly = result.stacks['MemoryAgent'];
      const resourceTypes = Object.values(assembly.resources).map((r) => r.type);
      expect(resourceTypes).toContain('agentforge::core::Memory');

      // The agent resource should reference the memory
      const agentRes = Object.values(assembly.resources).find(
        (r) => r.type === 'agentforge::core::Agent',
      )!;
      expect(agentRes.properties['memory']).toBeDefined();
    });
  });

  // ─── Description ───────────────────────────────────────────────────────────

  describe('description', () => {
    it('passes description to the Agent', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
        description: 'A research assistant that searches the web.',
      });

      const agents = findConstructsByType(app, Agent);
      expect(agents[0].description).toBe('A research assistant that searches the web.');
    });
  });

  // ─── Build / Assembly ──────────────────────────────────────────────────────

  describe('build / assembly', () => {
    it('builds successfully and produces an assembly', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a research assistant.',
      });

      const result = app.build({ writeOutput: false, throwOnError: false });
      expect(result.stacks).toBeDefined();
      expect(Object.keys(result.stacks)).toHaveLength(1);
      expect(result.stacks['Researcher']).toBeDefined();
    });

    it('assembly contains all expected resource types', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a research assistant.',
        tools: [
          {
            name: 'web_search',
            description: 'Search the web',
            handler: async () => 'result',
          },
        ],
        mcpServers: [
          {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@mcp/server-filesystem'],
          },
        ],
      });

      const result = app.build({ writeOutput: false, throwOnError: false });
      const assembly = result.stacks['Researcher'];
      const resourceTypes = Object.values(assembly.resources).map((r) => r.type);

      expect(resourceTypes).toContain('agentforge::core::Model');
      expect(resourceTypes).toContain('agentforge::core::Agent');
      expect(resourceTypes).toContain('agentforge::core::Tool');
      expect(resourceTypes).toContain('agentforge::core::MCPServer');
      // Prompt is auto-created as a child of Agent
      expect(resourceTypes).toContain('agentforge::core::Prompt');
    });

    it('assembly snapshot matches for a minimal agent', () => {
      const app = defineAgent({
        name: 'simple-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are helpful.',
      });

      const result = app.build({ writeOutput: false, throwOnError: false });
      const assembly = result.stacks['SimpleAgent'];

      // Remove volatile fields for snapshot stability
      const stableAssembly = {
        version: assembly.version,
        resources: assembly.resources,
        connections: assembly.connections,
        parameters: assembly.parameters,
      };

      expect(stableAssembly).toMatchSnapshot();
    });

    it('assembly snapshot matches for a full agent', () => {
      const app = defineAgent({
        name: 'full-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a full-featured agent.',
        description: 'A full agent with all options',
        tools: [
          {
            name: 'web_search',
            description: 'Search the web',
            handler: async () => 'result',
          },
          {
            name: 'file_read',
            description: 'Read files',
            handler: { file: './tools/read.ts', export: 'handler' },
          },
        ],
        mcpServers: [
          {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@mcp/server-filesystem', './workspace'],
            tools: ['read_file', 'write_file'],
          },
        ],
      });

      const result = app.build({ writeOutput: false, throwOnError: false });
      const assembly = result.stacks['FullAgent'];

      const stableAssembly = {
        version: assembly.version,
        resources: assembly.resources,
        connections: assembly.connections,
        parameters: assembly.parameters,
      };

      expect(stableAssembly).toMatchSnapshot();
    });
  });

  // ─── PascalCase conversion ─────────────────────────────────────────────────

  describe('pascalCase conversion', () => {
    it('converts kebab-case to PascalCase', () => {
      const app = defineAgent({
        name: 'my-research-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
      });

      const agents = findConstructsByType(app, Agent);
      // The stack name should be PascalCase
      const stacks = app.node.children.filter(
        (c) => c instanceof Stack
      ) as Stack[];
      expect(stacks[0].node.id).toBe('MyResearchAgent');
    });

    it('converts snake_case to PascalCase', () => {
      const app = defineAgent({
        name: 'my_research_agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
      });

      const stacks = app.node.children.filter(
        (c) => c instanceof Stack
      ) as Stack[];
      expect(stacks[0].node.id).toBe('MyResearchAgent');
    });

    it('handles single-word names', () => {
      const app = defineAgent({
        name: 'researcher',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'Hi.',
      });

      const stacks = app.node.children.filter(
        (c) => c instanceof Stack
      ) as Stack[];
      expect(stacks[0].node.id).toBe('Researcher');
    });
  });
});
