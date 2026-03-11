import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Construct } from 'constructs';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { App } from '../app.js';
import { Stack } from '../stack.js';
import { AgentResourceBase } from '../resource.js';
import { SecretRef } from '../secrets.js';
import { Token, resetTokenCounter } from '../tokens.js';
import { AgentForgeError } from '../errors.js';

// ─── Concrete test resources ─────────────────────────────────────────────────

class TestAgent extends AgentResourceBase {
  constructor(scope: Construct, id: string, props: { name: string; description?: string; apiKey?: unknown; model?: string; tools?: unknown[] }) {
    super(scope, id, 'agentforge::core::Agent', props.name);
    this.addProperty('name', props.name);
    if (props.description) this.addProperty('description', props.description);
    if (props.apiKey !== undefined) this.addProperty('apiKey', props.apiKey);
    if (props.model !== undefined) this.addProperty('model', props.model);
    if (props.tools !== undefined) this.addProperty('tools', props.tools);
  }
}

class TestModel extends AgentResourceBase {
  constructor(scope: Construct, id: string, props: { provider: string; modelId: string }) {
    super(scope, id, 'agentforge::core::Model', props.modelId);
    this.addProperty('provider', props.provider);
    this.addProperty('modelId', props.modelId);
  }
}

class TestTool extends AgentResourceBase {
  constructor(scope: Construct, id: string, props: { name: string; description?: string; inputSchema?: Record<string, unknown> }) {
    super(scope, id, 'agentforge::core::Tool', props.name);
    this.addProperty('name', props.name);
    if (props.description) this.addProperty('description', props.description);
    if (props.inputSchema) this.addProperty('inputSchema', props.inputSchema);
  }
}

beforeEach(() => {
  resetTokenCounter();
});

// ─── Construction ────────────────────────────────────────────────────────────

describe('App', () => {
  it('uses default props', () => {
    const app = new App();
    expect(app.outdir).toBe('agentforge.out');
    expect(app.agentforgeVersion).toBe('0.1.0');
    expect(app.projectRoot).toBe(process.cwd());
  });

  it('accepts custom props', () => {
    const app = new App({
      outdir: 'custom.out',
      agentforgeVersion: '1.0.0',
      projectRoot: '/my/project',
    });
    expect(app.outdir).toBe('custom.out');
    expect(app.agentforgeVersion).toBe('1.0.0');
    expect(app.projectRoot).toBe('/my/project');
  });

  it('has a TokenMap', () => {
    const app = new App();
    expect(app.tokenMap).toBeDefined();
    expect(app.tokenMap.size).toBe(0);
  });
});

// ─── build() pipeline ────────────────────────────────────────────────────────

describe('App.build', () => {
  it('produces a BuildResult with stacks and validation', () => {
    const app = new App();
    const stack = new Stack(app, 'Dev', { environment: 'development' });
    new TestAgent(stack, 'Agent', { name: 'TestAgent', description: 'A test agent' });

    const result = app.build({ writeOutput: false });

    expect(result.outdir).toBe('agentforge.out');
    expect(result.validation.valid).toBe(true);
    expect(Object.keys(result.stacks)).toEqual(['Dev']);
    expect(result.stacks.Dev).toBeDefined();
  });

  it('handles multiple stacks', () => {
    const app = new App();
    const dev = new Stack(app, 'Dev');
    const prod = new Stack(app, 'Prod');
    new TestAgent(dev, 'Agent', { name: 'DevAgent' });
    new TestAgent(prod, 'Agent', { name: 'ProdAgent' });

    const result = app.build({ writeOutput: false });
    expect(Object.keys(result.stacks)).toEqual(['Dev', 'Prod']);
    expect(result.stacks.Dev!.resources['App/Dev/Agent']!.properties.name).toBe('DevAgent');
    expect(result.stacks.Prod!.resources['App/Prod/Agent']!.properties.name).toBe('ProdAgent');
  });

  it('returns empty stacks record when no stacks exist', () => {
    const app = new App();
    const result = app.build({ writeOutput: false });
    expect(result.stacks).toEqual({});
    expect(result.validation.valid).toBe(true);
  });
});

// ─── Assembly structure ──────────────────────────────────────────────────────

describe('Assembly output structure', () => {
  it('has correct version and metadata', () => {
    const app = new App({ agentforgeVersion: '2.0.0' });
    const stack = new Stack(app, 'S');
    new TestAgent(stack, 'A', { name: 'Agent' });

    const result = app.build({ writeOutput: false });
    const assembly = result.stacks.S!;

    expect(assembly.version).toBe('0.1.0');
    expect(assembly.metadata.stackName).toBe('S');
    expect(assembly.metadata.agentforgeVersion).toBe('2.0.0');
    expect(assembly.metadata.synthesizedAt).toBeTruthy();
  });

  it('computes a sha256 assembly hash', () => {
    const app = new App();
    const stack = new Stack(app, 'S');
    new TestAgent(stack, 'A', { name: 'Agent' });

    const result = app.build({ writeOutput: false });
    const hash = result.stacks.S!.metadata.assemblyHash;
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces different hashes for different assemblies', () => {
    const app1 = new App();
    const s1 = new Stack(app1, 'S');
    new TestAgent(s1, 'A', { name: 'Agent1' });

    const app2 = new App();
    const s2 = new Stack(app2, 'S');
    new TestAgent(s2, 'A', { name: 'Agent2' });

    const r1 = app1.build({ writeOutput: false });
    const r2 = app2.build({ writeOutput: false });
    expect(r1.stacks.S!.metadata.assemblyHash).not.toBe(
      r2.stacks.S!.metadata.assemblyHash,
    );
  });

  it('generates protocol artifacts', () => {
    const app = new App();
    const stack = new Stack(app, 'S');
    new TestAgent(stack, 'A', { name: 'TestAgent', description: 'Does testing' });

    const result = app.build({ writeOutput: false });
    const protocols = result.stacks.S!.protocols;
    expect(protocols.agentsMd).toBeDefined();
    expect(protocols.agentsMd!.path).toBe('protocols/AGENTS.md');
    expect(protocols.agentsMd!.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ─── Token resolution during build ──────────────────────────────────────────

describe('Token resolution during build', () => {
  it('resolves token markers in resource properties', () => {
    const app = new App();
    const stack = new Stack(app, 'S');
    const token = new Token('endpoint', () => 'http://localhost:3000');
    app.tokenMap.register(token);

    new TestAgent(stack, 'Agent', { name: 'Agent', model: token.toString() });

    const result = app.build({ writeOutput: false });
    const props = result.stacks.S!.resources['App/S/Agent']!.properties;
    expect(props.model).toBe('http://localhost:3000');
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe('Validation during build', () => {
  it('throws AgentForgeError on validation errors when throwOnError is true', () => {
    const app = new App();
    const stack = new Stack(app, 'S');
    new TestAgent(stack, 'A', {
      name: 'Agent',
      apiKey: 'sk-abcdefghij1234567890abcdefghij',
    });

    expect(() => app.build({ writeOutput: false, throwOnError: true })).toThrow(
      AgentForgeError,
    );
  });

  it('returns validation result without throwing when throwOnError is false', () => {
    const app = new App();
    const stack = new Stack(app, 'S');
    new TestAgent(stack, 'A', {
      name: 'Agent',
      apiKey: 'sk-abcdefghij1234567890abcdefghij',
    });

    const result = app.build({ writeOutput: false, throwOnError: false });
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toHaveLength(1);
    expect(result.validation.errors[0]!.code).toBe('AF003');
  });

  it('defaults throwOnError to true', () => {
    const app = new App();
    const stack = new Stack(app, 'S');
    new TestAgent(stack, 'A', {
      name: 'Agent',
      apiKey: 'sk-abcdefghij1234567890abcdefghij',
    });

    expect(() => app.build({ writeOutput: false })).toThrow(AgentForgeError);
  });
});

// ─── Snapshot test for assembly output ───────────────────────────────────────

describe('Assembly snapshot', () => {
  it('matches expected assembly shape', () => {
    const app = new App({ agentforgeVersion: '0.1.0' });
    const stack = new Stack(app, 'TestStack', {
      environment: 'test',
      targets: ['local'],
    });

    const agent = new TestAgent(stack, 'MyAgent', {
      name: 'ResearchBot',
      description: 'A research assistant',
    });
    const model = new TestModel(stack, 'Claude', {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4',
    });
    agent.addDependency(model);

    const result = app.build({ writeOutput: false });
    const assembly = result.stacks.TestStack!;

    // Normalize dynamic fields for snapshot stability
    const normalized = {
      ...assembly,
      metadata: {
        ...assembly.metadata,
        assemblyHash: '<HASH>',
        synthesizedAt: '<TIMESTAMP>',
      },
      protocols: {
        ...assembly.protocols,
        agentsMd: assembly.protocols.agentsMd
          ? { ...assembly.protocols.agentsMd, contentHash: '<HASH>' }
          : undefined,
        a2aAgentCard: assembly.protocols.a2aAgentCard
          ? { ...assembly.protocols.a2aAgentCard, contentHash: '<HASH>' }
          : undefined,
        agentSkills: assembly.protocols.agentSkills
          ? { ...assembly.protocols.agentSkills, contentHash: '<HASH>' }
          : undefined,
      },
    };

    expect(normalized).toMatchSnapshot();
  });
});

// ─── Protocol artifacts written to disk ──────────────────────────────────────

describe('Protocol artifact file output', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `agentforge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes A2A agent card to protocols directory', () => {
    const app = new App({ outdir: tmpDir });
    const stack = new Stack(app, 'Test');
    const agent = new TestAgent(stack, 'Agent', {
      name: 'test-agent',
      description: 'A test agent',
    });
    new TestTool(stack, 'Tool', { name: 'my_tool', description: 'A tool' });

    app.build({ writeOutput: true });
    const a2aPath = join(tmpDir, 'stacks', 'Test', 'protocols', 'a2a-agent-card.json');
    expect(existsSync(a2aPath)).toBe(true);
    const card = JSON.parse(readFileSync(a2aPath, 'utf-8'));
    expect(card.name).toBe('test-agent');
  });

  it('writes Agent Skills manifest to protocols directory', () => {
    const app = new App({ outdir: tmpDir });
    const stack = new Stack(app, 'Test');
    new TestAgent(stack, 'Agent', { name: 'test-agent' });
    new TestTool(stack, 'Tool', { name: 'my_tool' });

    app.build({ writeOutput: true });
    const skillsPath = join(tmpDir, 'stacks', 'Test', 'protocols', 'agent-skills.json');
    expect(existsSync(skillsPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(skillsPath, 'utf-8'));
    expect(manifest.schema_version).toBe('1.0');
  });

  it('includes A2A and Skills refs in assembly protocols metadata', () => {
    const app = new App({ outdir: tmpDir });
    const stack = new Stack(app, 'Test');
    new TestAgent(stack, 'Agent', { name: 'test-agent', description: 'Test' });
    new TestTool(stack, 'Tool', { name: 'my_tool' });

    const result = app.build({ writeOutput: true });
    const protocols = result.stacks.Test!.protocols;
    expect(protocols.a2aAgentCard).toBeDefined();
    expect(protocols.a2aAgentCard!.path).toBe('protocols/a2a-agent-card.json');
    expect(protocols.a2aAgentCard!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(protocols.agentSkills).toBeDefined();
    expect(protocols.agentSkills!.path).toBe('protocols/agent-skills.json');
    expect(protocols.agentSkills!.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
