import { describe, it, expect } from 'vitest';
import { Construct } from 'constructs';
import { App } from '../app.js';
import { Stack } from '../stack.js';
import { AgentResourceBase } from '../resource.js';
import { SecretRef } from '../secrets.js';
import type { AssetRefEntry } from '../assembly.js';

// ─── Concrete test resource ──────────────────────────────────────────────────

class TestResource extends AgentResourceBase {
  constructor(
    scope: Construct,
    id: string,
    props: { name: string; apiKey?: unknown; extra?: unknown },
  ) {
    super(scope, id, 'agentforge::test::TestResource', props.name);
    this.addProperty('name', props.name);
    if (props.apiKey !== undefined) {
      this.addProperty('apiKey', props.apiKey);
    }
    if (props.extra !== undefined) {
      this.addProperty('extra', props.extra);
    }
  }
}

function createFixture() {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  return { app, stack };
}

// ─── Construction ────────────────────────────────────────────────────────────

describe('AgentResourceBase', () => {
  it('stores resourceType and displayName', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'MyRes', { name: 'Test' });
    expect(resource.resourceType).toBe('agentforge::test::TestResource');
    expect(resource.displayName).toBe('Test');
  });

  it('defaults displayName to the construct ID', () => {
    const { stack } = createFixture();

    class SimpleResource extends AgentResourceBase {
      constructor(scope: Construct, id: string) {
        super(scope, id, 'agentforge::test::Simple');
        this.addProperty('name', id);
      }
    }

    const r = new SimpleResource(stack, 'MyId');
    expect(r.displayName).toBe('MyId');
  });

  it('is a Construct with a node path', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'MyRes', { name: 'Test' });
    expect(resource.node.path).toBe('App/TestStack/MyRes');
  });
});

// ─── Properties ──────────────────────────────────────────────────────────────

describe('properties', () => {
  it('stores and retrieves properties', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', {
      name: 'Test',
      extra: { key: 'value' },
    });
    const props = resource.getProperties();
    expect(props.name).toBe('Test');
    expect(props.extra).toEqual({ key: 'value' });
  });

  it('returns a copy of properties', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', { name: 'Test' });
    const copy = resource.getProperties();
    (copy as Record<string, unknown>).injected = 'hack';
    expect(resource.getProperties()).not.toHaveProperty('injected');
  });
});

// ─── Dependencies ────────────────────────────────────────────────────────────

describe('dependencies', () => {
  it('tracks dependencies by resource instance', () => {
    const { stack } = createFixture();
    const r1 = new TestResource(stack, 'A', { name: 'A' });
    const r2 = new TestResource(stack, 'B', { name: 'B' });
    r2.addDependency(r1);
    expect(r2.dependencies).toEqual(['App/TestStack/A']);
  });

  it('tracks dependencies by string ID', () => {
    const { stack } = createFixture();
    const r = new TestResource(stack, 'A', { name: 'A' });
    r.addDependency('External/Resource');
    expect(r.dependencies).toContain('External/Resource');
  });

  it('deduplicates dependency IDs', () => {
    const { stack } = createFixture();
    const r1 = new TestResource(stack, 'A', { name: 'A' });
    const r2 = new TestResource(stack, 'B', { name: 'B' });
    r2.addDependency(r1);
    r2.addDependency(r1);
    expect(r2.dependencies).toHaveLength(1);
  });
});

// ─── Secret References ──────────────────────────────────────────────────────

describe('secret references', () => {
  it('auto-tracks SecretRef values added as properties', () => {
    const { stack } = createFixture();
    const ref = SecretRef.env('MY_KEY');
    const resource = new TestResource(stack, 'R', {
      name: 'Test',
      apiKey: ref,
    });
    expect(resource.secretRefs).toHaveLength(1);
    expect(resource.secretRefs[0]!.name).toBe('MY_KEY');
    expect(resource.secretRefs[0]!.propertyPath).toBe('properties.apiKey');
    expect(resource.secretRefs[0]!.source.type).toBe('env');
  });

  it('manually adds secret refs', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', { name: 'Test' });
    const ref = SecretRef.vault('path', 'key');
    resource.addSecretRef(ref, 'properties.token');
    expect(resource.secretRefs).toHaveLength(1);
    expect(resource.secretRefs[0]!.source.type).toBe('vault');
  });

  it('returns a copy of secret refs', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', { name: 'Test' });
    const refs = resource.secretRefs;
    (refs as unknown[]).push({} as never);
    expect(resource.secretRefs).toHaveLength(0);
  });
});

// ─── Asset References ────────────────────────────────────────────────────────

describe('asset references', () => {
  it('tracks added asset refs', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', { name: 'Test' });
    const assetRef: AssetRefEntry = {
      assetId: 'abc123',
      sourcePath: 'prompts/sys.md',
      assemblyPath: 'assets/abc123.md',
      contentHash: 'abc123',
      assetType: 'prompt_file',
      sizeBytes: 100,
    };
    resource.addAssetRef(assetRef);
    expect(resource.assetRefs).toHaveLength(1);
    expect(resource.assetRefs[0]).toEqual(assetRef);
  });
});

// ─── Metadata ────────────────────────────────────────────────────────────────

describe('metadata', () => {
  it('stores and retrieves metadata', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', { name: 'Test' });
    resource.addMetadata('target', 'docker');
    resource.addMetadata('logging', { enabled: true });
    expect(resource.metadata).toEqual({
      target: 'docker',
      logging: { enabled: true },
    });
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe('validate', () => {
  it('detects leaked secrets in properties', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', {
      name: 'Test',
      apiKey: 'sk-abcdefghij1234567890abcdefghij',
    });
    const diagnostics = resource.validate();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('AF003');
  });

  it('passes validation when no secrets are leaked', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', {
      name: 'Test',
      apiKey: SecretRef.env('MY_KEY'),
    });
    const diagnostics = resource.validate();
    expect(diagnostics).toHaveLength(0);
  });
});

// ─── toAssemblyResource ─────────────────────────────────────────────────────

describe('toAssemblyResource', () => {
  it('serializes to AgentResource format', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'MyRes', { name: 'Test' });
    resource.addMetadata('hint', 'docker');
    const data = resource.toAssemblyResource();

    expect(data.type).toBe('agentforge::test::TestResource');
    expect(data.id).toBe('App/TestStack/MyRes');
    expect(data.displayName).toBe('Test');
    expect(data.properties.name).toBe('Test');
    expect(data.dependencies).toEqual([]);
    expect(data.metadata).toEqual({ hint: 'docker' });
    expect(data.secretRefs).toEqual([]);
    expect(data.assetRefs).toEqual([]);
  });

  it('converts SecretRef properties to JSON in serialization', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', {
      name: 'Test',
      apiKey: SecretRef.env('KEY'),
    });
    const data = resource.toAssemblyResource();
    const serializedKey = data.properties.apiKey as Record<string, unknown>;
    expect(serializedKey.__agentforge_secret_ref__).toBe(true);
    expect((serializedKey.source as Record<string, unknown>).type).toBe('env');
  });

  it('serializes nested SecretRefs in objects and arrays', () => {
    const { stack } = createFixture();
    const resource = new TestResource(stack, 'R', {
      name: 'Test',
      extra: {
        keys: [SecretRef.env('K1'), SecretRef.vault('path')],
        nested: { secret: SecretRef.file('/path') },
      },
    });
    const data = resource.toAssemblyResource();
    const extra = data.properties.extra as Record<string, unknown>;
    const keys = (extra as Record<string, unknown>).keys as Array<Record<string, unknown>>;
    expect(keys[0]!.__agentforge_secret_ref__).toBe(true);
    expect(keys[1]!.__agentforge_secret_ref__).toBe(true);
    const nested = (extra as Record<string, unknown>).nested as Record<string, Record<string, unknown>>;
    expect(nested.secret.__agentforge_secret_ref__).toBe(true);
  });

  it('includes dependencies in serialization', () => {
    const { stack } = createFixture();
    const r1 = new TestResource(stack, 'A', { name: 'A' });
    const r2 = new TestResource(stack, 'B', { name: 'B' });
    r2.addDependency(r1);
    const data = r2.toAssemblyResource();
    expect(data.dependencies).toEqual(['App/TestStack/A']);
  });
});
