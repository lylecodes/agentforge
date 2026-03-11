/**
 * Tests for DockerTargetCompiler.
 *
 * Covers: validate(), compile(), supportedResourceTypes(), and the overall
 * ITargetCompiler contract. Deploy/destroy are NOT implemented for Docker
 * target in this phase.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { DockerTargetCompiler } from '../compiler.js';

import type { AgentAssembly, AgentResource } from '../types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

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

function makeTool(overrides?: Partial<AgentResource>): AgentResource {
  return {
    type: 'agentforge::core::Tool',
    id: 'TestStack/SearchTool',
    displayName: 'SearchTool',
    properties: {
      description: 'Searches the web',
      handlerType: 'inline',
      handlerCode: 'return { result: "found" };',
      parameters: { query: { type: 'string', description: 'Search query' } },
    },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
    ...overrides,
  };
}

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

function makeMCPServer(overrides?: Partial<AgentResource>): AgentResource {
  return {
    type: 'agentforge::core::MCPServer',
    id: 'TestStack/FileServer',
    displayName: 'FileServer',
    properties: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: {},
    },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
    ...overrides,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

let compiler: DockerTargetCompiler;
let tempDir: string;

beforeEach(() => {
  compiler = new DockerTargetCompiler();
  tempDir = join(tmpdir(), `agentforge-docker-test-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Constructor & Metadata ──────────────────────────────────────────────────

describe('DockerTargetCompiler metadata', () => {
  it('has name "docker"', () => {
    expect(compiler.name).toBe('docker');
  });

  it('has version "0.1.0"', () => {
    expect(compiler.version).toBe('0.1.0');
  });

  it('lists supported resource types', () => {
    const types = compiler.supportedResourceTypes();

    expect(types).toContain('agentforge::core::Agent');
    expect(types).toContain('agentforge::core::Model');
    expect(types).toContain('agentforge::core::Tool');
    expect(types).toContain('agentforge::core::Prompt');
    expect(types).toContain('agentforge::core::MCPServer');
    expect(types).toContain('agentforge::core::Memory');
    expect(types).toContain('agentforge::core::Schema');
    expect(types).toContain('agentforge::composition::Workflow');
    expect(types).toContain('agentforge::composition::Team');
    expect(types).toContain('agentforge::composition::Router');
    expect(types).toContain('agentforge::composition::Handoff');
    expect(types).toHaveLength(11);
  });

  it('returns a new array each time (no shared state)', () => {
    const a = compiler.supportedResourceTypes();
    const b = compiler.supportedResourceTypes();

    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ─── validate() ──────────────────────────────────────────────────────────────

describe('validate', () => {
  it('returns valid for assembly with at least one agent', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/Claude': makeModel(),
      },
      connections: [
        {
          id: 'conn-1',
          source: 'TestStack/Claude',
          target: 'TestStack/MyAgent',
          type: 'model_binding',
        },
      ],
    });

    const result = compiler.validate(assembly);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns error when assembly has no agent resources', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/Claude': makeModel(),
      },
    });

    const result = compiler.validate(assembly);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('at least one Agent resource');
  });

  it('returns error for empty assembly', () => {
    const assembly = makeAssembly();

    const result = compiler.validate(assembly);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('at least one Agent resource');
  });

  it('warns about unsupported resource types', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/GuardRail': {
          type: 'agentforge::governance::Guardrail',
          id: 'TestStack/GuardRail',
          displayName: 'GuardRail',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
      },
    });

    const result = compiler.validate(assembly);

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('agentforge::governance::Guardrail'))).toBe(true);
    expect(result.warnings.some(w => w.includes('not supported'))).toBe(true);
  });

  it('warns when an agent has no model binding', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
      },
    });

    const result = compiler.validate(assembly);

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('no model binding'))).toBe(true);
    expect(result.warnings.some(w => w.includes('default model'))).toBe(true);
  });

  it('does not warn about model binding when agent has one', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/Claude': makeModel(),
      },
      connections: [
        {
          id: 'conn-1',
          source: 'TestStack/Claude',
          target: 'TestStack/MyAgent',
          type: 'model_binding',
        },
      ],
    });

    const result = compiler.validate(assembly);

    expect(result.warnings.some(w => w.includes('no model binding'))).toBe(false);
  });

  it('does not warn about Memory and Schema resource types', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/Memory': {
          type: 'agentforge::core::Memory',
          id: 'TestStack/Memory',
          displayName: 'Memory',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/Schema': {
          type: 'agentforge::core::Schema',
          id: 'TestStack/Schema',
          displayName: 'Schema',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/Claude': makeModel(),
      },
      connections: [
        { id: 'c1', source: 'TestStack/Claude', target: 'TestStack/MyAgent', type: 'model_binding' },
      ],
    });

    const result = compiler.validate(assembly);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('deduplicates unsupported resource type warnings', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/G1': {
          type: 'agentforge::governance::Guardrail',
          id: 'TestStack/G1',
          displayName: 'G1',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/G2': {
          type: 'agentforge::governance::Guardrail',
          id: 'TestStack/G2',
          displayName: 'G2',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
      },
    });

    const result = compiler.validate(assembly);

    const guardrailWarnings = result.warnings.filter(w =>
      w.includes('agentforge::governance::Guardrail'),
    );
    expect(guardrailWarnings).toHaveLength(1);
  });

  it('does not warn about composition resource types (Workflow, Team, Router, Handoff)', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/Claude': makeModel(),
        'TestStack/Workflow': {
          type: 'agentforge::composition::Workflow',
          id: 'TestStack/Workflow',
          displayName: 'Workflow',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/Team': {
          type: 'agentforge::composition::Team',
          id: 'TestStack/Team',
          displayName: 'Team',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/Router': {
          type: 'agentforge::composition::Router',
          id: 'TestStack/Router',
          displayName: 'Router',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/Handoff': {
          type: 'agentforge::composition::Handoff',
          id: 'TestStack/Handoff',
          displayName: 'Handoff',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
      },
      connections: [
        { id: 'c1', source: 'TestStack/Claude', target: 'TestStack/MyAgent', type: 'model_binding' },
      ],
    });

    const result = compiler.validate(assembly);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

// ─── compile() ───────────────────────────────────────────────────────────────

describe('compile', () => {
  it('creates output directory structure', () => {
    const assembly = makeAssembly({
      resources: { 'TestStack/MyAgent': makeAgent() },
    });

    compiler.compile(assembly, tempDir);

    expect(existsSync(join(tempDir, 'agents'))).toBe(true);
    expect(existsSync(join(tempDir, 'tools'))).toBe(true);
  });

  it('produces Dockerfile artifact', () => {
    const assembly = makeAssembly({
      resources: { 'TestStack/MyAgent': makeAgent() },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(existsSync(join(tempDir, 'Dockerfile'))).toBe(true);
    const content = readFileSync(join(tempDir, 'Dockerfile'), 'utf-8');
    expect(content).toContain('FROM node:22-alpine');
    expect(content).toContain('HEALTHCHECK');

    const artifact = result.artifacts.find(a => a.path === 'Dockerfile');
    expect(artifact).toBeDefined();
    expect(artifact!.type).toBe('config');
  });

  it('produces docker-compose.yml artifact', () => {
    const assembly = makeAssembly({
      resources: { 'TestStack/MyAgent': makeAgent() },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(existsSync(join(tempDir, 'docker-compose.yml'))).toBe(true);
    const content = readFileSync(join(tempDir, 'docker-compose.yml'), 'utf-8');
    expect(content).toContain('services:');
    expect(content).toContain('agent-runtime:');

    const artifact = result.artifacts.find(a => a.path === 'docker-compose.yml');
    expect(artifact).toBeDefined();
    expect(artifact!.type).toBe('config');
  });

  it('produces .env.example artifact', () => {
    const assembly = makeAssembly({
      resources: { 'TestStack/MyAgent': makeAgent() },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(existsSync(join(tempDir, '.env.example'))).toBe(true);

    const artifact = result.artifacts.find(a => a.path === '.env.example');
    expect(artifact).toBeDefined();
    expect(artifact!.type).toBe('config');
  });

  it('produces package.json artifact', () => {
    const assembly = makeAssembly({
      resources: { 'TestStack/MyAgent': makeAgent() },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(existsSync(join(tempDir, 'package.json'))).toBe(true);
    const packageJson = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf-8'));
    expect(packageJson.name).toContain('agentforge-docker');
    expect(packageJson.type).toBe('module');
    expect(packageJson.scripts['docker:build']).toBeDefined();

    const artifact = result.artifacts.find(a => a.path === 'package.json');
    expect(artifact).toBeDefined();
    expect(artifact!.type).toBe('package');
  });

  it('produces tsconfig.json artifact', () => {
    const assembly = makeAssembly({
      resources: { 'TestStack/MyAgent': makeAgent() },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(existsSync(join(tempDir, 'tsconfig.json'))).toBe(true);
    const tsconfig = JSON.parse(readFileSync(join(tempDir, 'tsconfig.json'), 'utf-8'));
    expect(tsconfig.compilerOptions.target).toBe('ES2022');
    expect(tsconfig.compilerOptions.module).toBe('NodeNext');
    expect(tsconfig.compilerOptions.verbatimModuleSyntax).toBe(true);

    const artifact = result.artifacts.find(a => a.path === 'tsconfig.json');
    expect(artifact).toBeDefined();
    expect(artifact!.type).toBe('config');
  });

  it('produces runtime.ts as HTTP server (not readline)', () => {
    const assembly = makeAssembly({
      resources: { 'TestStack/MyAgent': makeAgent() },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(existsSync(join(tempDir, 'runtime.ts'))).toBe(true);
    const runtime = readFileSync(join(tempDir, 'runtime.ts'), 'utf-8');
    expect(runtime).toContain('createServer');
    expect(runtime).toContain('/health');
    expect(runtime).toContain('/agents');
    expect(runtime).toContain('MyAgent');
    expect(runtime).not.toContain('readline');

    const artifact = result.artifacts.find(a => a.path === 'runtime.ts');
    expect(artifact).toBeDefined();
    expect(artifact!.type).toBe('source');
  });

  it('generates per-agent module files', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/Agent1': makeAgent({ id: 'TestStack/Agent1', displayName: 'Agent1' }),
        'TestStack/Agent2': makeAgent({ id: 'TestStack/Agent2', displayName: 'Agent2' }),
      },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(existsSync(join(tempDir, 'agents', 'Agent1.ts'))).toBe(true);
    expect(existsSync(join(tempDir, 'agents', 'Agent2.ts'))).toBe(true);

    const agent1Code = readFileSync(join(tempDir, 'agents', 'Agent1.ts'), 'utf-8');
    expect(agent1Code).toContain('Agent: Agent1');
    expect(agent1Code).toContain('export async function chat');

    const agentArtifacts = result.artifacts.filter(a => a.path.startsWith('agents/'));
    expect(agentArtifacts).toHaveLength(2);
  });

  it('wires model to agent via model_binding connection', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/GPT': makeModel({
          id: 'TestStack/GPT',
          displayName: 'GPT',
          properties: { provider: 'openai', modelId: 'gpt-4o' },
        }),
      },
      connections: [
        {
          id: 'conn-1',
          source: 'TestStack/GPT',
          target: 'TestStack/MyAgent',
          type: 'model_binding',
        },
      ],
    });

    compiler.compile(assembly, tempDir);

    const agentCode = readFileSync(join(tempDir, 'agents', 'MyAgent.ts'), 'utf-8');
    expect(agentCode).toContain("import { openai } from '@ai-sdk/openai'");
    expect(agentCode).toContain("openai('gpt-4o')");
  });

  it('wires tools to agent via tool_binding connections', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/SearchTool': makeTool(),
      },
      connections: [
        {
          id: 'conn-1',
          source: 'TestStack/SearchTool',
          target: 'TestStack/MyAgent',
          type: 'tool_binding',
        },
      ],
    });

    compiler.compile(assembly, tempDir);

    const agentCode = readFileSync(join(tempDir, 'agents', 'MyAgent.ts'), 'utf-8');
    expect(agentCode).toContain('SearchTool: tool({');
    expect(agentCode).toContain('agentTools');
  });

  it('wires prompt to agent via prompt_binding connection', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/Prompt': makePrompt({
          properties: { content: 'Custom Docker prompt.' },
        }),
      },
      connections: [
        {
          id: 'conn-1',
          source: 'TestStack/Prompt',
          target: 'TestStack/MyAgent',
          type: 'prompt_binding',
        },
      ],
    });

    compiler.compile(assembly, tempDir);

    const agentCode = readFileSync(join(tempDir, 'agents', 'MyAgent.ts'), 'utf-8');
    expect(agentCode).toContain('Custom Docker prompt.');
  });

  it('wires MCP server to agent via mcp_binding connection', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/FileServer': makeMCPServer(),
      },
      connections: [
        {
          id: 'conn-1',
          source: 'TestStack/FileServer',
          target: 'TestStack/MyAgent',
          type: 'mcp_binding',
        },
      ],
    });

    compiler.compile(assembly, tempDir);

    const agentCode = readFileSync(join(tempDir, 'agents', 'MyAgent.ts'), 'utf-8');
    expect(agentCode).toContain('initMCPClients');
    expect(agentCode).toContain('FileServerClient');
  });

  it('docker-compose includes MCP sidecar when MCP servers are present', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/FileServer': makeMCPServer(),
      },
      connections: [
        { id: 'c1', source: 'TestStack/FileServer', target: 'TestStack/MyAgent', type: 'mcp_binding' },
      ],
    });

    compiler.compile(assembly, tempDir);

    const compose = readFileSync(join(tempDir, 'docker-compose.yml'), 'utf-8');
    expect(compose).toContain('fileserver:');
    expect(compose).toContain('depends_on:');
  });

  it('.env.example includes env-type secret refs', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent({
          secretRefs: [
            { name: 'api-key', source: { type: 'env', variableName: 'ANTHROPIC_API_KEY' }, propertyPath: 'apiKey' },
          ],
        }),
      },
    });

    compiler.compile(assembly, tempDir);

    const envExample = readFileSync(join(tempDir, '.env.example'), 'utf-8');
    expect(envExample).toContain('ANTHROPIC_API_KEY=');
  });

  it('tracks unsupported resource types in compile result', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/GuardRail': {
          type: 'agentforge::governance::Guardrail',
          id: 'TestStack/GuardRail',
          displayName: 'GuardRail',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
      },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(result.unsupportedResources).toContain('agentforge::governance::Guardrail');
  });

  it('returns empty unsupported list when all types are supported', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/Model': makeModel(),
      },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(result.unsupportedResources).toHaveLength(0);
  });

  it('generates runtime for multiple agents', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/A': makeAgent({ id: 'TestStack/A', displayName: 'AlphaBot' }),
        'TestStack/B': makeAgent({ id: 'TestStack/B', displayName: 'BetaBot' }),
      },
    });

    compiler.compile(assembly, tempDir);

    const runtime = readFileSync(join(tempDir, 'runtime.ts'), 'utf-8');
    expect(runtime).toContain('AlphaBot');
    expect(runtime).toContain('BetaBot');
    expect(runtime).toContain('2 agent(s) available');
  });

  it('writes tool handler stubs when asset source does not exist', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/FileTool': makeTool({
          id: 'TestStack/FileTool',
          displayName: 'FileTool',
          properties: {
            description: 'Tool with asset ref',
            handlerType: 'inline',
            parameters: {},
          },
          assetRefs: [
            {
              assetId: 'asset-abc',
              sourcePath: 'tools/myHandler.ts',
              assemblyPath: 'assets/myHandler.ts',
              contentHash: 'deadbeef',
              assetType: 'tool_handler',
              sizeBytes: 100,
            },
          ],
        }),
      },
    });

    const result = compiler.compile(assembly, tempDir);

    const stubPath = join(tempDir, 'tools', 'myHandler.ts');
    expect(existsSync(stubPath)).toBe(true);
    const stubContent = readFileSync(stubPath, 'utf-8');
    expect(stubContent).toContain('Asset not found');
    expect(stubContent).toContain('throw new Error');

    expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('copies tool handler assets when source file exists', () => {
    const assemblyDir = join(tempDir, 'assembly');
    const outDir = join(assemblyDir, 'docker');
    mkdirSync(join(assemblyDir, 'assets'), { recursive: true });
    mkdirSync(outDir, { recursive: true });

    writeFileSync(
      join(assemblyDir, 'assets', 'handler.ts'),
      'export default function(params: any) { return { ok: true }; }\n',
      'utf-8',
    );

    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/CopyTool': makeTool({
          id: 'TestStack/CopyTool',
          displayName: 'CopyTool',
          properties: {
            description: 'Tool with copyable asset',
            handlerType: 'inline',
            parameters: {},
          },
          assetRefs: [
            {
              assetId: 'asset-copy',
              sourcePath: 'tools/handler.ts',
              assemblyPath: 'assets/handler.ts',
              contentHash: 'aabbcc',
              assetType: 'tool_handler',
              sizeBytes: 64,
            },
          ],
        }),
      },
    });

    const result = compiler.compile(assembly, outDir);

    const copiedPath = join(outDir, 'tools', 'handler.ts');
    expect(existsSync(copiedPath)).toBe(true);
    const copiedContent = readFileSync(copiedPath, 'utf-8');
    expect(copiedContent).toContain('export default function');
    expect(copiedContent).not.toContain('Asset not found');

    expect(result.warnings.filter(w => w.includes('handler.ts')).length).toBe(0);
  });

  it('produces correct artifacts list for a full assembly', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/Agent': makeAgent(),
        'TestStack/Model': makeModel(),
        'TestStack/Tool': makeTool(),
        'TestStack/Prompt': makePrompt(),
        'TestStack/MCP': makeMCPServer(),
      },
      connections: [
        { id: 'c1', source: 'TestStack/Model', target: 'TestStack/Agent', type: 'model_binding' },
        { id: 'c2', source: 'TestStack/Tool', target: 'TestStack/Agent', type: 'tool_binding' },
        { id: 'c3', source: 'TestStack/Prompt', target: 'TestStack/Agent', type: 'prompt_binding' },
        { id: 'c4', source: 'TestStack/MCP', target: 'TestStack/Agent', type: 'mcp_binding' },
      ],
    });

    const result = compiler.compile(assembly, tempDir);

    const paths = result.artifacts.map(a => a.path);
    expect(paths).toContain('Dockerfile');
    expect(paths).toContain('docker-compose.yml');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('runtime.ts');
    expect(paths).toContain('agents/MyAgent.ts');
  });

  it('handles compile with no agents (still produces structure)', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/Model': makeModel(),
      },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(existsSync(join(tempDir, 'Dockerfile'))).toBe(true);
    expect(existsSync(join(tempDir, 'docker-compose.yml'))).toBe(true);
    expect(existsSync(join(tempDir, 'runtime.ts'))).toBe(true);
    expect(existsSync(join(tempDir, 'package.json'))).toBe(true);

    const runtime = readFileSync(join(tempDir, 'runtime.ts'), 'utf-8');
    expect(runtime).toContain('No agents configured');
  });

  it('writes valid JSON to package.json and tsconfig.json', () => {
    const assembly = makeAssembly({
      resources: { 'TestStack/MyAgent': makeAgent() },
    });

    compiler.compile(assembly, tempDir);

    const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf-8'));
    const tsconfig = JSON.parse(readFileSync(join(tempDir, 'tsconfig.json'), 'utf-8'));

    expect(typeof pkg).toBe('object');
    expect(typeof tsconfig).toBe('object');
  });

  it('handles agent with all binding types simultaneously', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/FullAgent': makeAgent({ id: 'TestStack/FullAgent', displayName: 'FullAgent' }),
        'TestStack/Model': makeModel(),
        'TestStack/Tool1': makeTool({ id: 'TestStack/Tool1', displayName: 'Tool1' }),
        'TestStack/Tool2': makeTool({
          id: 'TestStack/Tool2',
          displayName: 'Tool2',
          properties: {
            description: 'Second tool',
            handlerType: 'inline',
            handlerCode: 'return 42;',
            parameters: { x: { type: 'number', description: 'Input' } },
          },
        }),
        'TestStack/Prompt': makePrompt(),
        'TestStack/MCP': makeMCPServer(),
      },
      connections: [
        { id: 'c1', source: 'TestStack/Model', target: 'TestStack/FullAgent', type: 'model_binding' },
        { id: 'c2', source: 'TestStack/Tool1', target: 'TestStack/FullAgent', type: 'tool_binding' },
        { id: 'c3', source: 'TestStack/Tool2', target: 'TestStack/FullAgent', type: 'tool_binding' },
        { id: 'c4', source: 'TestStack/Prompt', target: 'TestStack/FullAgent', type: 'prompt_binding' },
        { id: 'c5', source: 'TestStack/MCP', target: 'TestStack/FullAgent', type: 'mcp_binding' },
      ],
    });

    const result = compiler.compile(assembly, tempDir);

    const agentCode = readFileSync(join(tempDir, 'agents', 'FullAgent.ts'), 'utf-8');

    // Model
    expect(agentCode).toContain("anthropic('claude-sonnet-4')");
    // Tools
    expect(agentCode).toContain('Tool1: tool({');
    expect(agentCode).toContain('Tool2: tool({');
    // Prompt
    expect(agentCode).toContain('You are a research assistant.');
    // MCP
    expect(agentCode).toContain('initMCPClients');
    expect(agentCode).toContain('FileServerClient');

    expect(result.artifacts.find(a => a.path === 'agents/FullAgent.ts')).toBeDefined();
    expect(result.unsupportedResources).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('deduplicates unsupported resource types', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/G1': {
          type: 'agentforge::governance::Guardrail',
          id: 'TestStack/G1',
          displayName: 'G1',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/G2': {
          type: 'agentforge::governance::Guardrail',
          id: 'TestStack/G2',
          displayName: 'G2',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
      },
    });

    const result = compiler.compile(assembly, tempDir);

    const guardrailEntries = result.unsupportedResources.filter(
      t => t === 'agentforge::governance::Guardrail',
    );
    expect(guardrailEntries).toHaveLength(1);
  });

  it('does not track composition resource types as unsupported', () => {
    const assembly = makeAssembly({
      resources: {
        'TestStack/MyAgent': makeAgent(),
        'TestStack/Workflow': {
          type: 'agentforge::composition::Workflow',
          id: 'TestStack/Workflow',
          displayName: 'Workflow',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/Team': {
          type: 'agentforge::composition::Team',
          id: 'TestStack/Team',
          displayName: 'Team',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/Router': {
          type: 'agentforge::composition::Router',
          id: 'TestStack/Router',
          displayName: 'Router',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
        'TestStack/Handoff': {
          type: 'agentforge::composition::Handoff',
          id: 'TestStack/Handoff',
          displayName: 'Handoff',
          properties: {},
          dependencies: [],
          metadata: {},
          secretRefs: [],
          assetRefs: [],
        },
      },
    });

    const result = compiler.compile(assembly, tempDir);

    expect(result.unsupportedResources).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
