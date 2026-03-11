/**
 * Tests for code generation utilities.
 *
 * Covers: generateAgentModule(), generateRuntime(), generatePackageJson(),
 *         generateMCPSetup(), generateConfigJson()
 */

import { describe, it, expect } from 'vitest';

import {
  generateAgentModule,
  generateRuntime,
  generatePackageJson,
  generateMCPSetup,
  generateConfigJson,
} from '../codegen.js';

import type { AgentAssembly, AgentResource } from '../types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Build a minimal valid AgentAssembly. */
function makeAssembly(overrides?: Partial<AgentAssembly>): AgentAssembly {
  return {
    version: '0.1.0',
    metadata: {
      stackName: 'TestStack',
      assemblyHash: 'abc123',
      synthesizedAt: '2026-01-01T00:00:00Z',
      agentforgeVersion: '0.1.0',
    },
    resources: {},
    connections: [],
    parameters: {},
    protocols: {},
    ...overrides,
  };
}

/** Build a minimal Agent resource. */
function makeAgent(overrides?: Partial<AgentResource>): AgentResource {
  return {
    type: 'agentforge::core::Agent',
    id: 'TestStack/MyAgent',
    displayName: 'MyAgent',
    properties: {},
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
    ...overrides,
  };
}

/** Build a minimal Model resource. */
function makeModel(overrides?: Partial<AgentResource>): AgentResource {
  return {
    type: 'agentforge::core::Model',
    id: 'TestStack/Claude',
    displayName: 'Claude',
    properties: { provider: 'anthropic', modelId: 'claude-sonnet-4' },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
    ...overrides,
  };
}

/** Build a minimal Tool resource. */
function makeTool(overrides?: Partial<AgentResource>): AgentResource {
  return {
    type: 'agentforge::core::Tool',
    id: 'TestStack/SearchTool',
    displayName: 'SearchTool',
    properties: {
      description: 'Searches the web',
      handlerType: 'inline',
      handlerCode: 'return { result: "found it" };',
      parameters: {
        query: { type: 'string', description: 'Search query' },
      },
    },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
    ...overrides,
  };
}

/** Build a minimal Prompt resource. */
function makePrompt(overrides?: Partial<AgentResource>): AgentResource {
  return {
    type: 'agentforge::core::Prompt',
    id: 'TestStack/SystemPrompt',
    displayName: 'SystemPrompt',
    properties: { content: 'You are a research assistant.' },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
    ...overrides,
  };
}

/** Build a minimal MCPServer resource. */
function makeMCPServer(overrides?: Partial<AgentResource>): AgentResource {
  return {
    type: 'agentforge::core::MCPServer',
    id: 'TestStack/FileServer',
    displayName: 'FileServer',
    properties: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: { HOME: '/Users/test' },
    },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
    ...overrides,
  };
}

// ─── generateAgentModule() ───────────────────────────────────────────────────

describe('generateAgentModule', () => {
  it('generates a module with default model when no model resource is provided', () => {
    const agent = makeAgent();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [], assembly);

    expect(code).toContain("import { generateText } from 'ai';");
    expect(code).toContain("import { anthropic } from '@ai-sdk/anthropic';");
    expect(code).toContain("anthropic('claude-sonnet-4')");
    expect(code).toContain('export async function chat');
    expect(code).toContain('export function resetConversation');
    expect(code).toContain('export const agentName');
    expect(code).toContain('"MyAgent"');
  });

  it('uses the correct provider package for openai models', () => {
    const agent = makeAgent();
    const model = makeModel({
      properties: { provider: 'openai', modelId: 'gpt-4o' },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, model, [], undefined, [], assembly);

    expect(code).toContain("import { openai } from '@ai-sdk/openai';");
    expect(code).toContain("openai('gpt-4o')");
    expect(code).not.toContain('@ai-sdk/anthropic');
  });

  it('uses the correct provider package for google models', () => {
    const agent = makeAgent();
    const model = makeModel({
      properties: { provider: 'google', modelId: 'gemini-2.0-flash' },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, model, [], undefined, [], assembly);

    expect(code).toContain("import { google } from '@ai-sdk/google';");
    expect(code).toContain("google('gemini-2.0-flash')");
  });

  it('falls back to anthropic for unknown provider', () => {
    const agent = makeAgent();
    const model = makeModel({
      properties: { provider: 'unknown-provider', modelId: 'some-model' },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, model, [], undefined, [], assembly);

    expect(code).toContain("import { anthropic } from '@ai-sdk/anthropic';");
    expect(code).toContain("anthropic('some-model')");
  });

  it('includes system prompt from Prompt resource (content field)', () => {
    const agent = makeAgent();
    const prompt = makePrompt({
      properties: { content: 'You are a coding assistant.' },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], prompt, [], assembly);

    expect(code).toContain('You are a coding assistant.');
  });

  it('includes system prompt from Prompt resource (template field)', () => {
    const agent = makeAgent();
    const prompt = makePrompt({
      properties: { template: 'You are a template-based assistant.' },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], prompt, [], assembly);

    expect(code).toContain('You are a template-based assistant.');
  });

  it('falls back to agent systemPrompt property when no Prompt resource', () => {
    const agent = makeAgent({
      properties: { systemPrompt: 'Agent-level prompt here.' },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [], assembly);

    expect(code).toContain('Agent-level prompt here.');
  });

  it('falls back to agent prompt property when no systemPrompt', () => {
    const agent = makeAgent({
      properties: { prompt: 'Short prompt from agent.' },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [], assembly);

    expect(code).toContain('Short prompt from agent.');
  });

  it('uses default system prompt when nothing is configured', () => {
    const agent = makeAgent();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [], assembly);

    expect(code).toContain('You are a helpful assistant.');
  });

  it('generates tool definitions for bound tools', () => {
    const agent = makeAgent();
    const tool = makeTool();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [tool], undefined, [], assembly);

    expect(code).toContain("import { z } from 'zod';");
    expect(code).toContain("import { tool } from 'ai';");
    expect(code).toContain('const agentTools');
    expect(code).toContain('SearchTool: tool({');
    expect(code).toContain('Searches the web');
    expect(code).toContain('z.string()');
    expect(code).toContain('tools: agentTools');
    expect(code).toContain('maxSteps: 10');
  });

  it('does not include tools section when there are no tools', () => {
    const agent = makeAgent();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [], assembly);

    expect(code).not.toContain('agentTools');
    expect(code).not.toContain("import { z } from 'zod'");
    expect(code).not.toContain('maxSteps');
  });

  it('generates tool with various parameter types', () => {
    const agent = makeAgent();
    const tool = makeTool({
      properties: {
        description: 'Multi-param tool',
        handlerType: 'inline',
        handlerCode: 'return {};',
        parameters: {
          name: { type: 'string', description: 'Name' },
          count: { type: 'number', description: 'Count' },
          intVal: { type: 'integer', description: 'Integer' },
          flag: { type: 'boolean', description: 'Flag' },
          items: { type: 'array', description: 'Items list' },
          data: { type: 'object', description: 'Data object' },
          optionalField: { type: 'string', description: 'Optional', optional: true },
        },
      },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [tool], undefined, [], assembly);

    expect(code).toContain('z.string().describe("Name")');
    expect(code).toContain('z.number().describe("Count")');
    expect(code).toContain('z.number().describe("Integer")');
    expect(code).toContain('z.boolean().describe("Flag")');
    expect(code).toContain('z.array(z.unknown()).describe("Items list")');
    expect(code).toContain('z.object({}).passthrough().describe("Data object")');
    expect(code).toContain('.optional()');
  });

  it('generates tool with file handler type', () => {
    const agent = makeAgent();
    const tool = makeTool({
      properties: {
        description: 'File-based tool',
        handlerType: 'file',
        handlerFile: 'src/tools/myTool.ts',
        parameters: {},
      },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [tool], undefined, [], assembly);

    expect(code).toContain("await import('./tools/myTool.ts')");
    expect(code).toContain('handler.default(params)');
  });

  it('generates tool with mcp handler type', () => {
    const agent = makeAgent();
    const tool = makeTool({
      properties: {
        description: 'MCP delegated tool',
        handlerType: 'mcp',
        mcpToolName: 'read_file',
        mcpServerId: 'FileServer',
        parameters: { path: { type: 'string', description: 'File path' } },
      },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [tool], undefined, [], assembly);

    expect(code).toContain('FileServerClient.callTool');
    expect(code).toContain('"read_file"');
  });

  it('generates tool with asset refs when inline handler has no code', () => {
    const agent = makeAgent();
    const tool = makeTool({
      properties: {
        description: 'Asset-based tool',
        handlerType: 'inline',
        parameters: {},
      },
      assetRefs: [
        {
          assetId: 'asset-123',
          sourcePath: 'tools/handler.ts',
          assemblyPath: 'assets/handler.ts',
          contentHash: 'deadbeef',
          assetType: 'tool_handler',
          sizeBytes: 256,
        },
      ],
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [tool], undefined, [], assembly);

    expect(code).toContain("await import('./tools/handler.ts')");
  });

  it('generates error for inline tool with no code and no assets', () => {
    const agent = makeAgent();
    const tool = makeTool({
      properties: {
        description: 'Empty tool',
        handlerType: 'inline',
        parameters: {},
      },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [tool], undefined, [], assembly);

    expect(code).toContain("throw new Error('Tool handler not implemented: SearchTool')");
  });

  it('generates error for file handler without path', () => {
    const agent = makeAgent();
    const tool = makeTool({
      properties: {
        description: 'File tool without path',
        handlerType: 'file',
        parameters: {},
      },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [tool], undefined, [], assembly);

    expect(code).toContain("throw new Error('Tool handler file not configured')");
  });

  it('includes MCP imports when MCP resources are present', () => {
    const agent = makeAgent();
    const mcp = makeMCPServer();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [mcp], assembly);

    expect(code).toContain("import { Client } from '@modelcontextprotocol/sdk/client/index.js';");
    expect(code).toContain("import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';");
    expect(code).toContain('await initMCPClients();');
  });

  it('does not include MCP imports when no MCP resources', () => {
    const agent = makeAgent();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [], assembly);

    expect(code).not.toContain('@modelcontextprotocol');
    expect(code).not.toContain('initMCPClients');
  });

  it('sanitizes agent display names into valid identifiers', () => {
    const agent = makeAgent({ displayName: '123-My Agent!' });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [], assembly);

    expect(code).toContain('"123-My Agent!"');
    expect(code).toContain('Agent: 123-My Agent!');
  });

  it('generates multiple tools for a single agent', () => {
    const agent = makeAgent();
    const tool1 = makeTool({
      displayName: 'SearchTool',
      properties: {
        description: 'Searches the web',
        handlerType: 'inline',
        handlerCode: 'return { found: true };',
        parameters: { query: { type: 'string', description: 'Query' } },
      },
    });
    const tool2 = makeTool({
      id: 'TestStack/CalcTool',
      displayName: 'CalcTool',
      properties: {
        description: 'Calculates things',
        handlerType: 'inline',
        handlerCode: 'return { value: 42 };',
        parameters: { expression: { type: 'string', description: 'Math expression' } },
      },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [tool1, tool2], undefined, [], assembly);

    expect(code).toContain('SearchTool: tool({');
    expect(code).toContain('CalcTool: tool({');
  });

  it('snapshot: full agent module with model, tools, and prompt', () => {
    const agent = makeAgent({ displayName: 'ResearchBot' });
    const model = makeModel({
      properties: { provider: 'anthropic', modelId: 'claude-sonnet-4' },
    });
    const prompt = makePrompt({
      properties: { content: 'You are a research assistant.' },
    });
    const tool = makeTool({
      displayName: 'WebSearch',
      properties: {
        description: 'Search the web',
        handlerType: 'inline',
        handlerCode: 'return { results: [] };',
        parameters: { query: { type: 'string', description: 'Search query' } },
      },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, model, [tool], prompt, [], assembly);

    expect(code).toMatchSnapshot();
  });

  it('snapshot: agent module with MCP server', () => {
    const agent = makeAgent({ displayName: 'MCPAgent' });
    const mcp = makeMCPServer();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [mcp], assembly);

    expect(code).toMatchSnapshot();
  });
});

// ─── generateMCPSetup() ─────────────────────────────────────────────────────

describe('generateMCPSetup', () => {
  it('returns empty string for no MCP resources', () => {
    const code = generateMCPSetup([]);

    expect(code).toBe('');
  });

  it('generates client declarations and init function for a single MCP server', () => {
    const mcp = makeMCPServer();

    const code = generateMCPSetup([mcp]);

    expect(code).toContain('let FileServerClient: Client;');
    expect(code).toContain('let mcpInitialized = false;');
    expect(code).toContain('async function initMCPClients()');
    expect(code).toContain("command: \"npx\"");
    expect(code).toContain('"-y"');
    expect(code).toContain('@modelcontextprotocol/server-filesystem');
    expect(code).toContain("\"HOME\": \"/Users/test\"");
    expect(code).toContain('FileServerClient = new Client');
    expect(code).toContain("name: \"FileServer-client\"");
    expect(code).toContain('await FileServerClient.connect');
    expect(code).toContain('FileServerClientTools');
  });

  it('generates initialization for multiple MCP servers', () => {
    const mcp1 = makeMCPServer({ displayName: 'FileServer' });
    const mcp2 = makeMCPServer({
      id: 'TestStack/GitServer',
      displayName: 'GitServer',
      properties: {
        command: 'node',
        args: ['./git-server.js'],
        env: {},
      },
    });

    const code = generateMCPSetup([mcp1, mcp2]);

    expect(code).toContain('let FileServerClient: Client;');
    expect(code).toContain('let GitServerClient: Client;');
    expect(code).toContain('Initialize MCP server: FileServer');
    expect(code).toContain('Initialize MCP server: GitServer');
    expect(code).toContain("command: \"node\"");
    expect(code).toContain('./git-server.js');
  });

  it('omits env block when env is empty', () => {
    const mcp = makeMCPServer({
      properties: {
        command: 'npx',
        args: ['some-server'],
        env: {},
      },
    });

    const code = generateMCPSetup([mcp]);

    // Should not contain an env property in the transport config
    expect(code).not.toContain('env:');
    expect(code).not.toContain('process.env');
  });

  it('includes early-return guard for idempotent initialization', () => {
    const mcp = makeMCPServer();

    const code = generateMCPSetup([mcp]);

    expect(code).toContain('if (mcpInitialized) return;');
    expect(code).toContain('mcpInitialized = true;');
  });

  it('snapshot: MCP setup with env vars', () => {
    const mcp = makeMCPServer({
      displayName: 'ToolServer',
      properties: {
        command: '/usr/local/bin/tool-server',
        args: ['--port', '3000'],
        env: { API_KEY: 'secret-key', NODE_ENV: 'production' },
      },
    });

    const code = generateMCPSetup([mcp]);

    expect(code).toMatchSnapshot();
  });
});

// ─── generateRuntime() ──────────────────────────────────────────────────────

describe('generateRuntime', () => {
  it('produces error output for zero agents', () => {
    const code = generateRuntime([]);

    expect(code).toContain('No agents configured');
    expect(code).toContain('process.exit(1)');
  });

  it('generates single-agent interactive CLI for one agent', () => {
    const code = generateRuntime(['ResearchBot']);

    expect(code).toContain("import * as ResearchBotAgent from './agents/ResearchBot.js';");
    expect(code).toContain("import * as readline from 'node:readline';");
    expect(code).toContain('ResearchBotAgent.chat(trimmed)');
    expect(code).toContain('ResearchBotAgent.resetConversation()');
    expect(code).toContain('/quit');
    expect(code).toContain('/exit');
    expect(code).toContain('/reset');
    expect(code).toContain('Agent: ResearchBot');
  });

  it('generates multi-agent selection menu for multiple agents', () => {
    const code = generateRuntime(['ResearchBot', 'CodeBot']);

    expect(code).toContain("import * as ResearchBotAgent from './agents/ResearchBot.js';");
    expect(code).toContain("import * as CodeBotAgent from './agents/CodeBot.js';");
    expect(code).toContain("'ResearchBot': ResearchBotAgent");
    expect(code).toContain("'CodeBot': CodeBotAgent");
    expect(code).toContain('Available agents:');
    expect(code).toContain('showMenu');
    expect(code).toContain('/switch');
    expect(code).toContain('Select an agent');
    expect(code).toContain('agent(s) available');
  });

  it('sanitizes agent names with special characters in identifiers', () => {
    const code = generateRuntime(['My Agent']);

    expect(code).toContain('My_AgentAgent');
    expect(code).toContain("'./agents/My Agent.js'");
  });

  it('snapshot: single agent runtime', () => {
    const code = generateRuntime(['TestAgent']);

    expect(code).toMatchSnapshot();
  });

  it('snapshot: multi-agent runtime', () => {
    const code = generateRuntime(['AgentAlpha', 'AgentBeta', 'AgentGamma']);

    expect(code).toMatchSnapshot();
  });
});

// ─── generatePackageJson() ──────────────────────────────────────────────────

describe('generatePackageJson', () => {
  it('generates basic structure with required fields', () => {
    const assembly = makeAssembly();

    const pkg = generatePackageJson(assembly);

    expect(pkg['name']).toBe('agentforge-runtime-teststack');
    expect(pkg['version']).toBe('0.0.1');
    expect(pkg['private']).toBe(true);
    expect(pkg['type']).toBe('module');
    expect(pkg['scripts']).toEqual({ start: 'npx tsx runtime.ts' });
  });

  it('includes devDependencies for tsx and typescript', () => {
    const assembly = makeAssembly();

    const pkg = generatePackageJson(assembly);
    const devDeps = pkg['devDependencies'] as Record<string, string>;

    expect(devDeps['tsx']).toMatch(/^\^4/);
    expect(devDeps['typescript']).toMatch(/^\^5/);
  });

  it('always includes ai and zod dependencies', () => {
    const assembly = makeAssembly();

    const pkg = generatePackageJson(assembly);
    const deps = pkg['dependencies'] as Record<string, string>;

    expect(deps['ai']).toBeDefined();
    expect(deps['zod']).toBeDefined();
  });

  it('defaults to anthropic provider when no models defined', () => {
    const assembly = makeAssembly();

    const pkg = generatePackageJson(assembly);
    const deps = pkg['dependencies'] as Record<string, string>;

    expect(deps['@ai-sdk/anthropic']).toBeDefined();
  });

  it('includes only the referenced providers', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/GPT': makeModel({
          id: 'TestStack/GPT',
          displayName: 'GPT',
          properties: { provider: 'openai', modelId: 'gpt-4o' },
        }),
        'TestStack/Gemini': makeModel({
          id: 'TestStack/Gemini',
          displayName: 'Gemini',
          properties: { provider: 'google', modelId: 'gemini-2.0-flash' },
        }),
      },
    });

    const pkg = generatePackageJson(assembly);
    const deps = pkg['dependencies'] as Record<string, string>;

    expect(deps['@ai-sdk/openai']).toBeDefined();
    expect(deps['@ai-sdk/google']).toBeDefined();
    expect(deps['@ai-sdk/anthropic']).toBeUndefined();
  });

  it('includes MCP SDK when MCPServer resources exist', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/FileServer': makeMCPServer(),
      },
    });

    const pkg = generatePackageJson(assembly);
    const deps = pkg['dependencies'] as Record<string, string>;

    expect(deps['@modelcontextprotocol/sdk']).toBeDefined();
  });

  it('does not include MCP SDK when no MCP servers', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
      },
    });

    const pkg = generatePackageJson(assembly);
    const deps = pkg['dependencies'] as Record<string, string>;

    expect(deps['@modelcontextprotocol/sdk']).toBeUndefined();
  });

  it('sanitizes stack name with special characters', () => {
    const assembly = makeAssembly({
      metadata: {
        stackName: 'My Cool Stack!',
        assemblyHash: 'abc',
        synthesizedAt: '2026-01-01T00:00:00Z',
        agentforgeVersion: '0.1.0',
      },
    });

    const pkg = generatePackageJson(assembly);

    expect(pkg['name']).toBe('agentforge-runtime-my-cool-stack-');
  });

  it('falls back to anthropic when only unknown providers are referenced', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/CustomModel': makeModel({
          id: 'TestStack/CustomModel',
          properties: { provider: 'custom-ai-provider', modelId: 'custom-v1' },
        }),
      },
    });

    const pkg = generatePackageJson(assembly);
    const deps = pkg['dependencies'] as Record<string, string>;

    // Unknown provider is not recognized by PROVIDER_MAP, so the providers set
    // stays empty. The fallback adds anthropic as the default.
    expect(deps['@ai-sdk/anthropic']).toBeDefined();
    expect(deps['custom-ai-provider']).toBeUndefined();
    expect(deps['ai']).toBeDefined();
    expect(deps['zod']).toBeDefined();
  });
});

// ─── generateConfigJson() ───────────────────────────────────────────────────

describe('generateConfigJson', () => {
  it('returns assembly metadata in the config', () => {
    const assembly = makeAssembly();

    const config = generateConfigJson(assembly);

    expect(config['assemblyVersion']).toBe('0.1.0');
    expect(config['stackName']).toBe('TestStack');
    expect(config['generatedAt']).toBeDefined();
  });

  it('extracts agents, models, tools, prompts, and mcpServers', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/Agent': makeAgent(),
        'TestStack/Model': makeModel(),
        'TestStack/Tool': makeTool(),
        'TestStack/Prompt': makePrompt(),
        'TestStack/MCP': makeMCPServer(),
      },
      connections: [
        {
          id: 'conn-1',
          source: 'TestStack/Model',
          target: 'TestStack/Agent',
          type: 'model_binding',
        },
      ],
    });

    const config = generateConfigJson(assembly);

    expect(config['agents']).toHaveLength(1);
    expect(config['models']).toHaveLength(1);
    expect(config['tools']).toHaveLength(1);
    expect(config['prompts']).toHaveLength(1);
    expect(config['mcpServers']).toHaveLength(1);
    expect(config['connections']).toHaveLength(1);
  });

  it('returns empty arrays when no resources of a type exist', () => {
    const assembly = makeAssembly();

    const config = generateConfigJson(assembly);

    expect(config['agents']).toEqual([]);
    expect(config['models']).toEqual([]);
    expect(config['tools']).toEqual([]);
    expect(config['prompts']).toEqual([]);
    expect(config['mcpServers']).toEqual([]);
    expect(config['connections']).toEqual([]);
  });

  it('includes resource properties in extracted entries', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/Agent': makeAgent({
          properties: { systemPrompt: 'Hello' },
        }),
      },
    });

    const config = generateConfigJson(assembly);
    const agents = config['agents'] as Array<Record<string, unknown>>;

    expect(agents[0]!['properties']).toEqual({ systemPrompt: 'Hello' });
    expect(agents[0]!['id']).toBe('TestStack/MyAgent');
    expect(agents[0]!['name']).toBe('MyAgent');
  });
});
