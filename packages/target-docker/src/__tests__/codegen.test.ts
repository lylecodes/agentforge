/**
 * Tests for Docker code generation utilities.
 *
 * Covers: generateDockerfile(), generateDockerCompose(), generateEnvExample(),
 *         generateAgentModule(), generateDockerRuntime(), generatePackageJson()
 */

import { describe, it, expect } from 'vitest';

import {
  generateDockerfile,
  generateDockerCompose,
  generateEnvExample,
  generateAgentModule,
  generateDockerRuntime,
  generatePackageJson,
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

// ─── generateDockerfile() ────────────────────────────────────────────────────

describe('generateDockerfile', () => {
  it('generates a multi-stage Dockerfile', () => {
    const dockerfile = generateDockerfile();

    expect(dockerfile).toContain('FROM node:22-alpine AS builder');
    expect(dockerfile).toContain('FROM node:22-alpine AS runtime');
  });

  it('includes npm install for dependencies', () => {
    const dockerfile = generateDockerfile();

    expect(dockerfile).toContain('COPY package.json');
    expect(dockerfile).toContain('RUN npm install');
    expect(dockerfile).toContain('RUN npm install --omit=dev');
  });

  it('compiles TypeScript in the builder stage', () => {
    const dockerfile = generateDockerfile();

    expect(dockerfile).toContain('RUN npx tsc');
  });

  it('copies compiled output from builder to runtime', () => {
    const dockerfile = generateDockerfile();

    expect(dockerfile).toContain('COPY --from=builder /app/dist ./dist');
  });

  it('exposes port 3000', () => {
    const dockerfile = generateDockerfile();

    expect(dockerfile).toContain('EXPOSE 3000');
  });

  it('includes a health check', () => {
    const dockerfile = generateDockerfile();

    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('http://localhost:3000/health');
  });

  it('sets production NODE_ENV', () => {
    const dockerfile = generateDockerfile();

    expect(dockerfile).toContain('ENV NODE_ENV=production');
  });

  it('runs the compiled runtime as CMD', () => {
    const dockerfile = generateDockerfile();

    expect(dockerfile).toContain('CMD ["node", "dist/runtime.js"]');
  });

  it('snapshot: full Dockerfile', () => {
    const dockerfile = generateDockerfile();

    expect(dockerfile).toMatchSnapshot();
  });
});

// ─── generateDockerCompose() ─────────────────────────────────────────────────

describe('generateDockerCompose', () => {
  it('generates a compose file with agent-runtime service', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
      },
    });

    const compose = generateDockerCompose(assembly);

    expect(compose).toContain('services:');
    expect(compose).toContain('agent-runtime:');
    expect(compose).toContain('build:');
    expect(compose).toContain('context: .');
    expect(compose).toContain('dockerfile: Dockerfile');
  });

  it('maps port 3000', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
      },
    });

    const compose = generateDockerCompose(assembly);

    expect(compose).toContain('"3000:3000"');
  });

  it('includes health check for the runtime service', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
      },
    });

    const compose = generateDockerCompose(assembly);

    expect(compose).toContain('healthcheck:');
    expect(compose).toContain('http://localhost:3000/health');
  });

  it('generates MCP sidecar services', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/FileServer': makeMCPServer(),
      },
      connections: [
        { id: 'c1', source: 'TestStack/FileServer', target: 'TestStack/MyAgent', type: 'mcp_binding' },
      ],
    });

    const compose = generateDockerCompose(assembly);

    expect(compose).toContain('fileserver:');
    expect(compose).toContain('image: node:22-alpine');
    expect(compose).toContain('depends_on:');
    expect(compose).toContain('- fileserver');
  });

  it('includes environment variables from env-type SecretRefs', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent({
          secretRefs: [
            { name: 'api-key', source: { type: 'env', variableName: 'ANTHROPIC_API_KEY' }, propertyPath: 'apiKey' },
          ],
        }),
      },
    });

    const compose = generateDockerCompose(assembly);

    expect(compose).toContain('environment:');
    expect(compose).toContain('ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}');
  });

  it('uses stack name in container name', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
      },
    });

    const compose = generateDockerCompose(assembly);

    expect(compose).toContain('container_name: teststack-runtime');
  });

  it('sets restart policy', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
      },
    });

    const compose = generateDockerCompose(assembly);

    expect(compose).toContain('restart: unless-stopped');
  });

  it('snapshot: compose with MCP sidecar and env vars', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent({
          secretRefs: [
            { name: 'api-key', source: { type: 'env', variableName: 'ANTHROPIC_API_KEY' }, propertyPath: 'apiKey' },
            { name: 'org-id', source: { type: 'env', variableName: 'ORG_ID' }, propertyPath: 'orgId' },
          ],
        }),
        'TestStack/FileServer': makeMCPServer(),
      },
      connections: [
        { id: 'c1', source: 'TestStack/FileServer', target: 'TestStack/MyAgent', type: 'mcp_binding' },
      ],
    });

    const compose = generateDockerCompose(assembly);

    expect(compose).toMatchSnapshot();
  });
});

// ─── generateEnvExample() ────────────────────────────────────────────────────

describe('generateEnvExample', () => {
  it('generates placeholder for env-type secret refs', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent({
          secretRefs: [
            { name: 'api-key', source: { type: 'env', variableName: 'ANTHROPIC_API_KEY' }, propertyPath: 'apiKey' },
          ],
        }),
      },
    });

    const envExample = generateEnvExample(assembly);

    expect(envExample).toContain('ANTHROPIC_API_KEY=');
    expect(envExample).toContain('TestStack');
  });

  it('deduplicates env variables across resources', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/Agent1': makeAgent({
          id: 'TestStack/Agent1',
          displayName: 'Agent1',
          secretRefs: [
            { name: 'key1', source: { type: 'env', variableName: 'API_KEY' }, propertyPath: 'key' },
          ],
        }),
        'TestStack/Agent2': makeAgent({
          id: 'TestStack/Agent2',
          displayName: 'Agent2',
          secretRefs: [
            { name: 'key2', source: { type: 'env', variableName: 'API_KEY' }, propertyPath: 'key' },
          ],
        }),
      },
    });

    const envExample = generateEnvExample(assembly);

    // Should only appear once despite two resources referencing it
    const matches = envExample.match(/API_KEY=/g);
    expect(matches).toHaveLength(1);
  });

  it('ignores non-env secret sources', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent({
          secretRefs: [
            { name: 'vault-secret', source: { type: 'vault', provider: 'hashicorp', path: '/secret/key' }, propertyPath: 'secret' },
            { name: 'file-secret', source: { type: 'file', filePath: '/etc/secret' }, propertyPath: 'file' },
          ],
        }),
      },
    });

    const envExample = generateEnvExample(assembly);

    expect(envExample).toContain('No environment variables required');
  });

  it('generates comment when no env vars exist', () => {
    const assembly = makeAssembly();

    const envExample = generateEnvExample(assembly);

    expect(envExample).toContain('No environment variables required');
  });

  it('collects env vars from multiple resource types', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent({
          secretRefs: [
            { name: 'agent-key', source: { type: 'env', variableName: 'AGENT_KEY' }, propertyPath: 'key' },
          ],
        }),
        'TestStack/Model': makeModel({
          secretRefs: [
            { name: 'model-key', source: { type: 'env', variableName: 'MODEL_KEY' }, propertyPath: 'apiKey' },
          ],
        }),
      },
    });

    const envExample = generateEnvExample(assembly);

    expect(envExample).toContain('AGENT_KEY=');
    expect(envExample).toContain('MODEL_KEY=');
  });

  it('snapshot: env example with multiple vars', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent({
          secretRefs: [
            { name: 'api-key', source: { type: 'env', variableName: 'ANTHROPIC_API_KEY' }, propertyPath: 'apiKey' },
            { name: 'org-id', source: { type: 'env', variableName: 'ORG_ID' }, propertyPath: 'orgId' },
          ],
        }),
        'TestStack/Model': makeModel({
          secretRefs: [
            { name: 'openai-key', source: { type: 'env', variableName: 'OPENAI_API_KEY' }, propertyPath: 'apiKey' },
          ],
        }),
      },
    });

    const envExample = generateEnvExample(assembly);

    expect(envExample).toMatchSnapshot();
  });
});

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

  it('marks as generated by target-docker', () => {
    const agent = makeAgent();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [], assembly);

    expect(code).toContain('Generated by @agentforge/target-docker');
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

  it('includes system prompt from Prompt resource', () => {
    const agent = makeAgent();
    const prompt = makePrompt({
      properties: { content: 'You are a coding assistant.' },
    });
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], prompt, [], assembly);

    expect(code).toContain('You are a coding assistant.');
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
    expect(code).toContain('tools: agentTools');
    expect(code).toContain('maxSteps: 10');
  });

  it('does not include tools section when there are no tools', () => {
    const agent = makeAgent();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [], assembly);

    expect(code).not.toContain('agentTools');
    expect(code).not.toContain("import { z } from 'zod'");
  });

  it('includes MCP imports when MCP resources are present', () => {
    const agent = makeAgent();
    const mcp = makeMCPServer();
    const assembly = makeAssembly();

    const code = generateAgentModule(agent, undefined, [], undefined, [mcp], assembly);

    expect(code).toContain("import { Client } from '@modelcontextprotocol/sdk/client/index.js';");
    expect(code).toContain('await initMCPClients();');
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
});

// ─── generateDockerRuntime() ─────────────────────────────────────────────────

describe('generateDockerRuntime', () => {
  it('generates error server for zero agents', () => {
    const code = generateDockerRuntime([]);

    expect(code).toContain('No agents configured');
    expect(code).toContain('createServer');
    expect(code).toContain('503');
  });

  it('generates HTTP server with agent routes for one agent', () => {
    const code = generateDockerRuntime(['ResearchBot']);

    expect(code).toContain("import * as ResearchBotAgent from './agents/ResearchBot.js';");
    expect(code).toContain("import { createServer } from 'node:http';");
    expect(code).toContain("'ResearchBot': ResearchBotAgent");
    expect(code).toContain('/health');
    expect(code).toContain('/agents');
    expect(code).toContain('/chat');
    expect(code).toContain('/reset');
  });

  it('does NOT use readline (Docker runtime uses HTTP)', () => {
    const code = generateDockerRuntime(['ResearchBot']);

    expect(code).not.toContain('readline');
    expect(code).not.toContain('rl.question');
  });

  it('supports multiple agents', () => {
    const code = generateDockerRuntime(['AgentA', 'AgentB']);

    expect(code).toContain("import * as AgentAAgent from './agents/AgentA.js';");
    expect(code).toContain("import * as AgentBAgent from './agents/AgentB.js';");
    expect(code).toContain("'AgentA': AgentAAgent");
    expect(code).toContain("'AgentB': AgentBAgent");
  });

  it('includes health check endpoint', () => {
    const code = generateDockerRuntime(['MyAgent']);

    expect(code).toContain("pathname === '/health'");
    expect(code).toContain("status: 'ok'");
  });

  it('includes agent listing endpoint', () => {
    const code = generateDockerRuntime(['MyAgent']);

    expect(code).toContain("pathname === '/agents'");
    expect(code).toContain('agentNames');
  });

  it('reads PORT from environment variable', () => {
    const code = generateDockerRuntime(['MyAgent']);

    expect(code).toContain("process.env['PORT']");
    expect(code).toContain("'3000'");
  });

  it('includes body parsing for POST requests', () => {
    const code = generateDockerRuntime(['MyAgent']);

    expect(code).toContain('parseBody');
    expect(code).toContain('JSON.parse');
  });

  it('handles 404 for unknown agents', () => {
    const code = generateDockerRuntime(['MyAgent']);

    expect(code).toContain('404');
    expect(code).toContain('not found');
  });

  it('handles 400 for missing message field', () => {
    const code = generateDockerRuntime(['MyAgent']);

    expect(code).toContain('400');
    expect(code).toContain('Missing "message" field');
  });

  it('handles 500 for internal errors', () => {
    const code = generateDockerRuntime(['MyAgent']);

    expect(code).toContain('500');
    expect(code).toContain('error');
  });

  it('snapshot: single agent Docker runtime', () => {
    const code = generateDockerRuntime(['TestAgent']);

    expect(code).toMatchSnapshot();
  });

  it('snapshot: multi-agent Docker runtime', () => {
    const code = generateDockerRuntime(['AgentAlpha', 'AgentBeta', 'AgentGamma']);

    expect(code).toMatchSnapshot();
  });
});

// ─── generatePackageJson() ──────────────────────────────────────────────────

describe('generatePackageJson', () => {
  it('generates basic structure with required fields', () => {
    const assembly = makeAssembly();

    const pkg = generatePackageJson(assembly);

    expect(pkg['name']).toBe('agentforge-docker-teststack');
    expect(pkg['version']).toBe('0.0.1');
    expect(pkg['private']).toBe(true);
    expect(pkg['type']).toBe('module');
  });

  it('includes Docker-specific scripts', () => {
    const assembly = makeAssembly();

    const pkg = generatePackageJson(assembly);
    const scripts = pkg['scripts'] as Record<string, string>;

    expect(scripts['build']).toBe('tsc');
    expect(scripts['start']).toBe('node dist/runtime.js');
    expect(scripts['docker:build']).toBe('docker compose build');
    expect(scripts['docker:up']).toBe('docker compose up -d');
    expect(scripts['docker:down']).toBe('docker compose down');
  });

  it('includes TypeScript devDependencies', () => {
    const assembly = makeAssembly();

    const pkg = generatePackageJson(assembly);
    const devDeps = pkg['devDependencies'] as Record<string, string>;

    expect(devDeps['typescript']).toMatch(/^\^5/);
    expect(devDeps['@types/node']).toMatch(/^\^22/);
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
      },
    });

    const pkg = generatePackageJson(assembly);
    const deps = pkg['dependencies'] as Record<string, string>;

    expect(deps['@ai-sdk/openai']).toBeDefined();
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
});
