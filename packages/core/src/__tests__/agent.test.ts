import { describe, it, expect } from 'vitest';
import { App, Stack, SecretRef } from '@agentforge/constructs';
import { Agent } from '../agent.js';
import { Model } from '../model.js';
import { Tool } from '../tool.js';
import { Prompt } from '../prompt.js';
import { MCPServer } from '../mcp-server.js';
import { Memory, MemoryType } from '../memory.js';

/**
 * Helper: create a fresh App + Stack for each test.
 */
function createStack(id = 'TestStack') {
  const app = new App();
  const stack = new Stack(app, id);
  return stack;
}

/**
 * Helper: access the protected resolveProperties method.
 */
function resolveProps(agent: Agent): Record<string, unknown> {
  return (agent as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
}

// ─── Construction ────────────────────────────────────────────────────────────

describe('Agent', () => {
  describe('construction', () => {
    it('stores name and model', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'research-assistant',
        model,
      });

      expect(agent.agentName).toBe('research-assistant');
      expect(agent.model).toBe(model);
    });

    it('stores optional description', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        description: 'A helpful research assistant',
        model,
      });

      expect(agent.description).toBe('A helpful research assistant');
    });

    it('leaves description undefined when not provided', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      expect(agent.description).toBeUndefined();
    });

    it('sets the resource type to agentforge::core::Agent', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      expect(agent.resourceType).toBe('agentforge::core::Agent');
    });
  });

  // ─── Model Dependency ──────────────────────────────────────────────────────

  describe('model dependency', () => {
    it('registers a dependency on the model', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      const deps = agent.node.dependencies;
      expect(deps.map((d) => d.node.path)).toContain(model.node.path);
    });
  });

  // ─── Tools ─────────────────────────────────────────────────────────────────

  describe('tools', () => {
    it('stores tools passed in constructor', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const tool1 = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: async () => 'result',
      });
      const tool2 = new Tool(stack, 'Write', {
        name: 'write_file',
        description: 'Write a file',
        handler: { file: './tools/write.ts', export: 'default' },
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        tools: [tool1, tool2],
      });

      expect(agent.tools).toHaveLength(2);
      expect(agent.tools[0]).toBe(tool1);
      expect(agent.tools[1]).toBe(tool2);
    });

    it('defaults to empty tools when not provided', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      expect(agent.tools).toHaveLength(0);
    });

    it('registers dependencies on each tool', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search',
        handler: async () => 'result',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        tools: [tool],
      });

      const deps = agent.node.dependencies;
      expect(deps.map((d) => d.node.path)).toContain(tool.node.path);
    });

    it('supports adding tools after construction', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search',
        handler: async () => 'result',
      });

      agent.addTool(tool);

      expect(agent.tools).toHaveLength(1);
      expect(agent.tools[0]).toBe(tool);
      const deps = agent.node.dependencies;
      expect(deps.map((d) => d.node.path)).toContain(tool.node.path);
    });
  });

  // ─── Prompt ────────────────────────────────────────────────────────────────

  describe('prompt', () => {
    it('accepts a Prompt construct', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const prompt = new Prompt(stack, 'System', {
        content: 'You are a helpful assistant.',
        role: 'system',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        prompt,
      });

      expect(agent.prompt).toBe(prompt);
    });

    it('registers a dependency on an external Prompt', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const prompt = new Prompt(stack, 'System', {
        content: 'You are a helpful assistant.',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        prompt,
      });

      const deps = agent.node.dependencies;
      expect(deps.map((d) => d.node.path)).toContain(prompt.node.path);
    });

    it('auto-creates a Prompt child when a plain string is provided', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        prompt: 'You are a helpful assistant.',
      });

      expect(agent.prompt).toBeDefined();
      expect(agent.prompt).toBeInstanceOf(Prompt);
      expect(agent.prompt!.content).toBe('You are a helpful assistant.');
      expect(agent.prompt!.role).toBe('system');
    });

    it('auto-created prompt is a child of the agent (not an external dependency)', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        prompt: 'You are a helpful assistant.',
      });

      // The auto-created Prompt should be a child of the Agent
      expect(agent.prompt!.node.path).toBe('App/TestStack/Assistant/Prompt');
    });

    it('leaves prompt undefined when not provided', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      expect(agent.prompt).toBeUndefined();
    });
  });

  // ─── MCP Servers ───────────────────────────────────────────────────────────

  describe('mcpServers', () => {
    it('stores MCP servers passed in constructor', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const mcpServer = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@mcp/server-filesystem'],
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        mcpServers: [mcpServer],
      });

      expect(agent.mcpServers).toHaveLength(1);
      expect(agent.mcpServers[0]).toBe(mcpServer);
    });

    it('registers dependencies on each MCP server', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const mcpServer = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        mcpServers: [mcpServer],
      });

      const deps = agent.node.dependencies;
      expect(deps.map((d) => d.node.path)).toContain(mcpServer.node.path);
    });

    it('supports adding MCP servers after construction', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });
      const mcpServer = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });

      agent.addMCPServer(mcpServer);

      expect(agent.mcpServers).toHaveLength(1);
      expect(agent.mcpServers[0]).toBe(mcpServer);
    });
  });

  // ─── Config ────────────────────────────────────────────────────────────────

  describe('config', () => {
    it('stores arbitrary config overrides', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        config: { maxRetries: 3, debug: true },
      });

      expect(agent.config).toEqual({ maxRetries: 3, debug: true });
    });

    it('leaves config undefined when not provided', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      expect(agent.config).toBeUndefined();
    });
  });

  // ─── Memory ─────────────────────────────────────────────────────────────────

  describe('memory', () => {
    it('attaches memory via constructor', () => {
      const stack = createStack();
      const model = new Model(stack, 'M', { provider: 'anthropic', modelId: 'claude-sonnet-4' });
      const memory = new Memory(stack, 'Mem', { type: MemoryType.CONVERSATION, backend: 'sqlite' });
      const agent = new Agent(stack, 'A', { name: 'bot', model, memory });
      const assembly = agent.toAssemblyResource();
      expect(assembly.properties.memory).toBe('App/TestStack/Mem');
      const deps = agent.node.dependencies;
      expect(deps.map((d) => d.node.path)).toContain(memory.node.path);
    });

    it('attaches memory via addMemory()', () => {
      const stack = createStack();
      const model = new Model(stack, 'M', { provider: 'anthropic', modelId: 'claude-sonnet-4' });
      const agent = new Agent(stack, 'A', { name: 'bot', model });
      const memory = new Memory(stack, 'Mem', { type: MemoryType.SUMMARY, backend: 'redis' });
      agent.addMemory(memory);
      const assembly = agent.toAssemblyResource();
      expect(assembly.properties.memory).toBe('App/TestStack/Mem');
    });

    it('exposes memory via getter', () => {
      const stack = createStack();
      const model = new Model(stack, 'M', { provider: 'anthropic', modelId: 'claude-sonnet-4' });
      const memory = new Memory(stack, 'Mem', { type: MemoryType.CONVERSATION, backend: 'sqlite' });
      const agent = new Agent(stack, 'A', { name: 'bot', model, memory });
      expect(agent.memory).toBe(memory);
    });

    it('memory is undefined when not set', () => {
      const stack = createStack();
      const model = new Model(stack, 'M', { provider: 'anthropic', modelId: 'claude-sonnet-4' });
      const agent = new Agent(stack, 'A', { name: 'bot', model });
      expect(agent.memory).toBeUndefined();
    });
  });

  // ─── Serialization (resolveProperties) ──────────────────────────────────────

  describe('resolveProperties', () => {
    it('includes name and model path', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      const props = resolveProps(agent);
      expect(props.name).toBe('assistant');
      expect(props.model).toBe('App/TestStack/Claude');
    });

    it('includes description when set', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        description: 'A helpful assistant',
        model,
      });

      const props = resolveProps(agent);
      expect(props.description).toBe('A helpful assistant');
    });

    it('omits description when not set', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      const props = resolveProps(agent);
      expect(props).not.toHaveProperty('description');
    });

    it('includes tool paths when tools are bound', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search',
        handler: async () => 'result',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        tools: [tool],
      });

      const props = resolveProps(agent);
      expect(props.tools).toEqual(['App/TestStack/Search']);
    });

    it('omits tools when none are bound', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      const props = resolveProps(agent);
      expect(props).not.toHaveProperty('tools');
    });

    it('includes prompt path', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const prompt = new Prompt(stack, 'System', {
        content: 'Hello.',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        prompt,
      });

      const props = resolveProps(agent);
      expect(props.prompt).toBe('App/TestStack/System');
    });

    it('includes auto-created prompt path (child path)', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        prompt: 'You are helpful.',
      });

      const props = resolveProps(agent);
      expect(props.prompt).toBe('App/TestStack/Assistant/Prompt');
    });

    it('includes MCP server paths', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const mcpServer = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        mcpServers: [mcpServer],
      });

      const props = resolveProps(agent);
      expect(props.mcpServers).toEqual(['App/TestStack/FS']);
    });

    it('includes config when set', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        config: { maxRetries: 3 },
      });

      const props = resolveProps(agent);
      expect(props.config).toEqual({ maxRetries: 3 });
    });

    it('omits config when not set', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
      });

      const props = resolveProps(agent);
      expect(props).not.toHaveProperty('config');
    });

    it('omits config when the object is empty', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'assistant',
        model,
        config: {},
      });

      const props = resolveProps(agent);
      expect(props).not.toHaveProperty('config');
    });

    it('matches snapshot for a fully-wired agent', () => {
      const stack = createStack();
      const model = Model.anthropic(stack, 'Claude', 'claude-sonnet-4');
      const tool1 = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: async () => 'result',
      });
      const tool2 = new Tool(stack, 'Write', {
        name: 'write_file',
        description: 'Write a file',
        handler: { file: './tools/write.ts', export: 'default' },
      });
      const prompt = new Prompt(stack, 'System', {
        content: 'You are a research assistant.',
      });
      const mcpServer = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@mcp/server-filesystem'],
      });
      const agent = new Agent(stack, 'Assistant', {
        name: 'research-assistant',
        description: 'Assists with research tasks',
        model,
        tools: [tool1, tool2],
        prompt,
        mcpServers: [mcpServer],
        config: { maxRetries: 3 },
      });

      const props = resolveProps(agent);
      expect(props).toMatchSnapshot();
    });
  });

  // ─── Construct tree ─────────────────────────────────────────────────────────

  describe('construct tree', () => {
    it('has the correct node path', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });
      const agent = new Agent(stack, 'MyAgent', {
        name: 'my-agent',
        model,
      });

      expect(agent.node.path).toBe('App/TestStack/MyAgent');
    });
  });
});
