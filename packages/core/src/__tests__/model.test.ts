import { describe, it, expect } from 'vitest';
import { App, Stack, SecretRef } from '@agentforge/constructs';
import { Model } from '../model.js';

/**
 * Helper: create a fresh App + Stack for each test.
 */
function createStack(id = 'TestStack') {
  const app = new App();
  const stack = new Stack(app, id);
  return stack;
}

// ─── Construction ────────────────────────────────────────────────────────────

describe('Model', () => {
  describe('construction', () => {
    it('stores provider and modelId', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      expect(model.provider).toBe('anthropic');
      expect(model.modelId).toBe('claude-sonnet-4');
    });

    it('stores optional temperature and maxTokens', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
        temperature: 0.7,
        maxTokens: 4096,
      });

      expect(model.temperature).toBe(0.7);
      expect(model.maxTokens).toBe(4096);
    });

    it('leaves temperature and maxTokens undefined when not provided', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      expect(model.temperature).toBeUndefined();
      expect(model.maxTokens).toBeUndefined();
    });

    it('stores apiKey as a SecretRef', () => {
      const stack = createStack();
      const apiKey = SecretRef.env('ANTHROPIC_API_KEY');
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
        apiKey,
      });

      expect(model.apiKey).toBe(apiKey);
      expect(model.apiKey?.name).toBe('ANTHROPIC_API_KEY');
    });

    it('registers a dependency when a fallback model is provided', () => {
      const stack = createStack();
      const fallback = new Model(stack, 'Haiku', {
        provider: 'anthropic',
        modelId: 'claude-haiku-3',
      });
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
        fallback,
      });

      expect(model.fallback).toBe(fallback);
      // The constructs library tracks dependencies via node.addDependency
      const deps = model.node.dependencies;
      expect(deps.map((d) => d.node.path)).toContain(fallback.node.path);
    });

    it('sets the resource type to agentforge::core::Model', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      expect(model.resourceType).toBe('agentforge::core::Model');
    });

    it('uses the construct ID as the display name by default', () => {
      const stack = createStack();
      const model = new Model(stack, 'MyClaude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      expect(model.displayName).toBe('MyClaude');
    });
  });

  // ─── Factory Methods ────────────────────────────────────────────────────────

  describe('Model.anthropic()', () => {
    it('creates a model with provider "anthropic"', () => {
      const stack = createStack();
      const model = Model.anthropic(stack, 'Claude', 'claude-sonnet-4');

      expect(model.provider).toBe('anthropic');
      expect(model.modelId).toBe('claude-sonnet-4');
    });

    it('uses ANTHROPIC_API_KEY env var by default', () => {
      const stack = createStack();
      const model = Model.anthropic(stack, 'Claude', 'claude-sonnet-4');

      expect(model.apiKey).toBeDefined();
      expect(model.apiKey?.name).toBe('ANTHROPIC_API_KEY');
      expect(model.apiKey?.source).toEqual({
        type: 'env',
        variableName: 'ANTHROPIC_API_KEY',
      });
    });

    it('accepts optional temperature and maxTokens overrides', () => {
      const stack = createStack();
      const model = Model.anthropic(stack, 'Claude', 'claude-sonnet-4', {
        temperature: 0.5,
        maxTokens: 2048,
      });

      expect(model.temperature).toBe(0.5);
      expect(model.maxTokens).toBe(2048);
    });

    it('allows overriding the default apiKey', () => {
      const stack = createStack();
      const customKey = SecretRef.vault('secret/keys', 'anthropic');
      const model = Model.anthropic(stack, 'Claude', 'claude-sonnet-4', {
        apiKey: customKey,
      });

      expect(model.apiKey).toBe(customKey);
    });

    it('accepts a fallback model', () => {
      const stack = createStack();
      const fallback = Model.anthropic(stack, 'Haiku', 'claude-haiku-3');
      const model = Model.anthropic(stack, 'Claude', 'claude-sonnet-4', {
        fallback,
      });

      expect(model.fallback).toBe(fallback);
    });
  });

  describe('Model.openai()', () => {
    it('creates a model with provider "openai" and default API key', () => {
      const stack = createStack();
      const model = Model.openai(stack, 'GPT4o', 'gpt-4o');

      expect(model.provider).toBe('openai');
      expect(model.modelId).toBe('gpt-4o');
      expect(model.apiKey?.name).toBe('OPENAI_API_KEY');
    });
  });

  describe('Model.google()', () => {
    it('creates a model with provider "google" and default API key', () => {
      const stack = createStack();
      const model = Model.google(stack, 'Gemini', 'gemini-2.0-flash');

      expect(model.provider).toBe('google');
      expect(model.modelId).toBe('gemini-2.0-flash');
      expect(model.apiKey?.name).toBe('GOOGLE_API_KEY');
    });
  });

  // ─── Serialization (resolveProperties) ──────────────────────────────────────

  describe('resolveProperties', () => {
    it('includes provider and modelId in serialized output', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      // resolveProperties is protected — access via casting
      const props = (model as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
      expect(props.provider).toBe('anthropic');
      expect(props.modelId).toBe('claude-sonnet-4');
    });

    it('includes temperature and maxTokens when set', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
        temperature: 0.7,
        maxTokens: 4096,
      });

      const props = (model as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
      expect(props.temperature).toBe(0.7);
      expect(props.maxTokens).toBe(4096);
    });

    it('omits temperature and maxTokens when not set', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      const props = (model as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
      expect(props).not.toHaveProperty('temperature');
      expect(props).not.toHaveProperty('maxTokens');
    });

    it('serializes apiKey as SecretRef JSON', () => {
      const stack = createStack();
      const model = Model.anthropic(stack, 'Claude', 'claude-sonnet-4');

      const props = (model as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
      expect(props.apiKey).toEqual({
        __agentforge_secret_ref__: true,
        source: { type: 'env', variableName: 'ANTHROPIC_API_KEY' },
      });
    });

    it('serializes fallback as the fallback model node path', () => {
      const stack = createStack();
      const fallback = Model.anthropic(stack, 'Haiku', 'claude-haiku-3');
      const model = Model.anthropic(stack, 'Claude', 'claude-sonnet-4', {
        fallback,
      });

      const props = (model as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
      expect(props.fallback).toBe(fallback.node.path);
    });

    it('omits apiKey and fallback when not set', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      const props = (model as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
      expect(props).not.toHaveProperty('apiKey');
      expect(props).not.toHaveProperty('fallback');
    });

    it('matches snapshot for a fully-specified model', () => {
      const stack = createStack();
      const fallback = new Model(stack, 'Fallback', {
        provider: 'anthropic',
        modelId: 'claude-haiku-3',
      });
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
        temperature: 0.7,
        maxTokens: 4096,
        apiKey: SecretRef.env('ANTHROPIC_API_KEY'),
        fallback,
      });

      const props = (model as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
      expect(props).toMatchSnapshot();
    });
  });

  // ─── Node path ──────────────────────────────────────────────────────────────

  describe('construct tree', () => {
    it('has the correct node path', () => {
      const stack = createStack();
      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      expect(model.node.path).toBe('App/TestStack/Claude');
    });
  });
});
