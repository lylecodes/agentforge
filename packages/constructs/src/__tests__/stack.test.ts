import { describe, it, expect } from 'vitest';
import { Construct } from 'constructs';
import { App } from '../app.js';
import { Stack } from '../stack.js';
import { AgentResourceBase } from '../resource.js';
import { SecretRef } from '../secrets.js';
import type { Connection, Parameter } from '../assembly.js';

// ─── Concrete test resource ──────────────────────────────────────────────────

class TestResource extends AgentResourceBase {
  constructor(scope: Construct, id: string, props: { name: string; apiKey?: unknown }) {
    super(scope, id, 'agentforge::core::Agent', props.name);
    this.addProperty('name', props.name);
    if (props.apiKey !== undefined) {
      this.addProperty('apiKey', props.apiKey);
    }
  }
}

function createFixture() {
  const app = new App();
  return { app };
}

// ─── Construction ────────────────────────────────────────────────────────────

describe('Stack', () => {
  it('stores environment, config, targets, and description', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'Prod', {
      environment: 'production',
      config: { model: 'anthropic/claude-sonnet-4' },
      targets: ['docker', 'k8s'],
      description: 'Production stack',
    });
    expect(stack.environment).toBe('production');
    expect(stack.config).toEqual({ model: 'anthropic/claude-sonnet-4' });
    expect(stack.targets).toEqual(['docker', 'k8s']);
    expect(stack.description).toBe('Production stack');
  });

  it('defaults optional props', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'Default');
    expect(stack.environment).toBeUndefined();
    expect(stack.config).toEqual({});
    expect(stack.targets).toEqual([]);
    expect(stack.description).toBeUndefined();
  });

  it('is a Construct with a node path', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'MyStack');
    expect(stack.node.id).toBe('MyStack');
    expect(stack.node.path).toBe('App/MyStack');
  });
});

// ─── Connections ─────────────────────────────────────────────────────────────

describe('connections', () => {
  it('registers and retrieves connections', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    const conn: Connection = {
      id: 'conn-1',
      source: 'S/Agent',
      target: 'S/Tool',
      type: 'tool_binding',
    };
    stack.addConnection(conn);
    expect(stack.connections).toEqual([conn]);
  });

  it('returns a copy of connections', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    const conns = stack.connections;
    conns.push({} as never);
    expect(stack.connections).toHaveLength(0);
  });
});

// ─── Parameters ──────────────────────────────────────────────────────────────

describe('parameters', () => {
  it('registers and retrieves parameters', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    const param: Parameter = {
      name: 'modelId',
      type: 'string',
      description: 'The model to use',
      required: true,
    };
    stack.addParameter(param);
    expect(stack.parameters).toEqual({ modelId: param });
  });

  it('overwrites parameters with same name', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    stack.addParameter({
      name: 'model',
      type: 'string',
      description: 'First',
      required: true,
    });
    stack.addParameter({
      name: 'model',
      type: 'string',
      description: 'Second',
      required: false,
    });
    expect(stack.parameters.model!.description).toBe('Second');
  });
});

// ─── collectResources ────────────────────────────────────────────────────────

describe('collectResources', () => {
  it('collects all AgentResourceBase descendants', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    new TestResource(stack, 'Agent1', { name: 'Agent 1' });
    new TestResource(stack, 'Agent2', { name: 'Agent 2' });

    const resources = stack.collectResources();
    expect(Object.keys(resources)).toHaveLength(2);
    expect(resources['App/S/Agent1']).toBeDefined();
    expect(resources['App/S/Agent2']).toBeDefined();
    expect(resources['App/S/Agent1']!.properties.name).toBe('Agent 1');
  });

  it('collects nested resources', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    const group = new Construct(stack, 'Group');
    new TestResource(group, 'Nested', { name: 'Nested' });

    const resources = stack.collectResources();
    expect(resources['App/S/Group/Nested']).toBeDefined();
  });

  it('returns empty record for empty stack', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'Empty');
    expect(stack.collectResources()).toEqual({});
  });
});

// ─── collectDiagnostics ──────────────────────────────────────────────────────

describe('collectDiagnostics', () => {
  it('collects validation diagnostics from child resources', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    new TestResource(stack, 'R', {
      name: 'Bad',
      apiKey: 'sk-abcdefghij1234567890abcdefghij',
    });

    const diagnostics = stack.collectDiagnostics();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toBe('AF003');
  });

  it('returns empty for clean resources', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    new TestResource(stack, 'R', { name: 'Clean' });
    expect(stack.collectDiagnostics()).toEqual([]);
  });
});

// ─── synthesize ──────────────────────────────────────────────────────────────

describe('synthesize', () => {
  it('produces an AgentAssembly structure', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'MyStack', {
      environment: 'production',
      targets: ['docker'],
    });
    new TestResource(stack, 'Agent', { name: 'TestAgent' });

    const assembly = stack.synthesize('0.1.0');

    expect(assembly.version).toBe('0.1.0');
    expect(assembly.metadata.stackName).toBe('MyStack');
    expect(assembly.metadata.agentforgeVersion).toBe('0.1.0');
    expect(assembly.metadata.assemblyHash).toBe(''); // Computed later
    expect(assembly.metadata.intendedTargets).toEqual(['docker']);
    expect(assembly.metadata.synthesizedAt).toBeTruthy();
    expect(Object.keys(assembly.resources)).toHaveLength(1);
    expect(assembly.connections).toEqual([]);
    expect(assembly.parameters).toEqual({});
    expect(assembly.protocols).toEqual({});
  });

  it('includes connections and parameters', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    stack.addConnection({
      id: 'c1',
      source: 'S/Agent',
      target: 'S/Tool',
      type: 'tool_binding',
    });
    stack.addParameter({
      name: 'p1',
      type: 'string',
      description: 'param',
      required: true,
    });

    const assembly = stack.synthesize('0.1.0');
    expect(assembly.connections).toHaveLength(1);
    expect(assembly.parameters.p1).toBeDefined();
  });

  it('omits intendedTargets when empty', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    const assembly = stack.synthesize('0.1.0');
    expect(assembly.metadata.intendedTargets).toBeUndefined();
  });

  it('accepts protocol artifacts', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    const protocols = {
      agentsMd: { path: 'protocols/AGENTS.md', contentHash: 'abc' },
    };
    const assembly = stack.synthesize('0.1.0', protocols);
    expect(assembly.protocols).toEqual(protocols);
  });
});

// ─── Stack.isStack ───────────────────────────────────────────────────────────

describe('Stack.isStack', () => {
  it('returns true for Stack instances', () => {
    const { app } = createFixture();
    const stack = new Stack(app, 'S');
    expect(Stack.isStack(stack)).toBe(true);
  });

  it('returns false for non-Stack constructs', () => {
    const { app } = createFixture();
    const plain = new Construct(app, 'Plain');
    expect(Stack.isStack(plain)).toBe(false);
  });
});
