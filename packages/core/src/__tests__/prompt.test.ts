import { describe, it, expect } from 'vitest';
import { App, Stack, AssetRef } from '@agentforge/constructs';
import { Prompt } from '../prompt.js';
import type { FewShotExample } from '../prompt.js';

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
function resolveProps(prompt: Prompt): Record<string, unknown> {
  return (prompt as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
}

// ─── Construction ────────────────────────────────────────────────────────────

describe('Prompt', () => {
  describe('construction', () => {
    it('stores inline string content', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'You are a helpful assistant.',
      });

      expect(prompt.content).toBe('You are a helpful assistant.');
    });

    it('defaults role to "system"', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'You are a helpful assistant.',
      });

      expect(prompt.role).toBe('system');
    });

    it('accepts a custom role', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'UserMsg', {
        content: 'Tell me about AI.',
        role: 'user',
      });

      expect(prompt.role).toBe('user');
    });

    it('accepts assistant role', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'AssistantMsg', {
        content: 'I can help with that.',
        role: 'assistant',
      });

      expect(prompt.role).toBe('assistant');
    });

    it('stores template variables', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'You are an expert in {domain}.',
        variables: { domain: 'technology' },
      });

      expect(prompt.variables).toEqual({ domain: 'technology' });
    });

    it('leaves variables undefined when not provided', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'You are a helpful assistant.',
      });

      expect(prompt.variables).toBeUndefined();
    });

    it('stores few-shot examples', () => {
      const stack = createStack();
      const examples: FewShotExample[] = [
        { user: 'I love this!', assistant: 'positive' },
        { user: 'Terrible.', assistant: 'negative' },
      ];
      const prompt = new Prompt(stack, 'System', {
        content: 'You classify sentiment.',
        fewShotExamples: examples,
      });

      expect(prompt.fewShotExamples).toEqual(examples);
    });

    it('stores AssetRef content', () => {
      const stack = createStack();
      const assetRef = new AssetRef('./prompts/system.md', 'prompt_file');
      const prompt = new Prompt(stack, 'System', {
        content: assetRef,
      });

      expect(prompt.content).toBeInstanceOf(AssetRef);
      expect((prompt.content as AssetRef).filePath).toBe('./prompts/system.md');
    });

    it('sets the resource type to agentforge::core::Prompt', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'Hello.',
      });

      expect(prompt.resourceType).toBe('agentforge::core::Prompt');
    });
  });

  // ─── Factory: fromAsset ────────────────────────────────────────────────────

  describe('Prompt.fromAsset()', () => {
    it('creates a prompt with AssetRef content', () => {
      const stack = createStack();
      const prompt = Prompt.fromAsset(stack, 'System', './prompts/research.md');

      expect(prompt.content).toBeInstanceOf(AssetRef);
      expect((prompt.content as AssetRef).filePath).toBe('./prompts/research.md');
      expect((prompt.content as AssetRef).assetType).toBe('prompt_file');
    });

    it('defaults role to "system" when no options provided', () => {
      const stack = createStack();
      const prompt = Prompt.fromAsset(stack, 'System', './prompts/research.md');

      expect(prompt.role).toBe('system');
    });

    it('accepts optional variables and role', () => {
      const stack = createStack();
      const prompt = Prompt.fromAsset(stack, 'System', './prompts/research.md', {
        variables: { domain: 'technology' },
        role: 'user',
      });

      expect(prompt.variables).toEqual({ domain: 'technology' });
      expect(prompt.role).toBe('user');
    });

    it('accepts few-shot examples', () => {
      const stack = createStack();
      const examples: FewShotExample[] = [
        { user: 'Question', assistant: 'Answer' },
      ];
      const prompt = Prompt.fromAsset(stack, 'System', './prompts/qa.md', {
        fewShotExamples: examples,
      });

      expect(prompt.fewShotExamples).toEqual(examples);
    });
  });

  // ─── Serialization (resolveProperties) ──────────────────────────────────────

  describe('resolveProperties', () => {
    it('serializes inline string content', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'You are a helpful assistant.',
      });

      const props = resolveProps(prompt);
      expect(props.content).toBe('You are a helpful assistant.');
      expect(props.role).toBe('system');
    });

    it('serializes AssetRef content as JSON', () => {
      const stack = createStack();
      const prompt = Prompt.fromAsset(stack, 'System', './prompts/system.md');

      const props = resolveProps(prompt);
      expect(props.content).toEqual({
        __agentforge_asset_ref__: true,
        filePath: './prompts/system.md',
        assetType: 'prompt_file',
      });
    });

    it('includes variables when provided', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'Expert in {domain}.',
        variables: { domain: 'tech', tone: 'professional' },
      });

      const props = resolveProps(prompt);
      expect(props.variables).toEqual({ domain: 'tech', tone: 'professional' });
    });

    it('omits variables when not provided', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'Hello.',
      });

      const props = resolveProps(prompt);
      expect(props).not.toHaveProperty('variables');
    });

    it('omits variables when the object is empty', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'Hello.',
        variables: {},
      });

      const props = resolveProps(prompt);
      expect(props).not.toHaveProperty('variables');
    });

    it('includes few-shot examples when provided', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'Classify sentiment.',
        fewShotExamples: [
          { user: 'Great!', assistant: 'positive' },
          { user: 'Bad.', assistant: 'negative' },
        ],
      });

      const props = resolveProps(prompt);
      expect(props.fewShotExamples).toEqual([
        { user: 'Great!', assistant: 'positive' },
        { user: 'Bad.', assistant: 'negative' },
      ]);
    });

    it('omits few-shot examples when not provided', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'Hello.',
      });

      const props = resolveProps(prompt);
      expect(props).not.toHaveProperty('fewShotExamples');
    });

    it('omits few-shot examples when the array is empty', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'Hello.',
        fewShotExamples: [],
      });

      const props = resolveProps(prompt);
      expect(props).not.toHaveProperty('fewShotExamples');
    });

    it('matches snapshot for a fully-specified prompt', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'System', {
        content: 'You are an expert in {domain}.',
        role: 'system',
        variables: { domain: 'technology' },
        fewShotExamples: [
          { user: 'What is AI?', assistant: 'Artificial intelligence.' },
        ],
      });

      const props = resolveProps(prompt);
      expect(props).toMatchSnapshot();
    });

    it('matches snapshot for an asset-backed prompt', () => {
      const stack = createStack();
      const prompt = Prompt.fromAsset(stack, 'System', './prompts/research.md', {
        variables: { domain: 'science' },
        role: 'system',
      });

      const props = resolveProps(prompt);
      expect(props).toMatchSnapshot();
    });
  });

  // ─── Construct tree ─────────────────────────────────────────────────────────

  describe('construct tree', () => {
    it('has the correct node path', () => {
      const stack = createStack();
      const prompt = new Prompt(stack, 'MyPrompt', {
        content: 'Hello.',
      });

      expect(prompt.node.path).toBe('App/TestStack/MyPrompt');
    });
  });
});
