/**
 * @module prompt
 *
 * The Prompt construct represents a prompt template that an Agent uses as
 * its system, user, or assistant message. Prompts support inline content
 * (plain strings) and file-backed content (loaded as assets during build).
 *
 * @example
 * ```typescript
 * // Inline prompt
 * const prompt = new Prompt(stack, 'System', {
 *   content: 'You are a helpful research assistant.',
 *   role: 'system',
 * });
 *
 * // Prompt from asset file
 * const prompt = Prompt.fromAsset(stack, 'System', './prompts/research.md', {
 *   variables: { domain: 'technology' },
 *   role: 'system',
 * });
 *
 * // Prompt with few-shot examples
 * const prompt = new Prompt(stack, 'System', {
 *   content: 'You classify customer sentiment.',
 *   role: 'system',
 *   fewShotExamples: [
 *     { user: 'I love this product!', assistant: 'positive' },
 *     { user: 'Terrible experience.', assistant: 'negative' },
 *   ],
 * });
 * ```
 */

import { Construct } from 'constructs';
import {
  AgentResourceBase,
  AssetRef,
} from '@agentforge/constructs';

// ─── Supporting Types ───────────────────────────────────────────────────────

/**
 * A few-shot example pairing a user message with the expected assistant response.
 */
export interface FewShotExample {
  /** The example user message. */
  readonly user: string;
  /** The expected assistant response. */
  readonly assistant: string;
}

/**
 * Allowed prompt roles in the conversation.
 */
export type PromptRole = 'system' | 'user' | 'assistant';

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for a {@link Prompt} construct.
 */
export interface PromptProps {
  /**
   * The prompt content. Can be:
   * - A plain string with the prompt text.
   * - An {@link AssetRef} referencing a file to be loaded at build time.
   */
  readonly content: string | AssetRef;

  /**
   * Template variables to interpolate into the prompt content.
   * Variable placeholders in the content use `{variableName}` syntax.
   */
  readonly variables?: Record<string, string>;

  /**
   * The conversation role for this prompt.
   * @default 'system'
   */
  readonly role?: PromptRole;

  /**
   * Few-shot examples appended after the prompt content to demonstrate
   * expected input/output behavior.
   */
  readonly fewShotExamples?: FewShotExample[];
}

/**
 * Options for the {@link Prompt.fromAsset} factory method.
 */
export interface PromptFromAssetOptions {
  /** Template variables. */
  readonly variables?: Record<string, string>;
  /** Conversation role. */
  readonly role?: PromptRole;
  /** Few-shot examples. */
  readonly fewShotExamples?: FewShotExample[];
}

// ─── Resource Type ──────────────────────────────────────────────────────────

/** Assembly resource type for Prompt constructs. */
const PROMPT_RESOURCE_TYPE = 'agentforge::core::Prompt';

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * A prompt template used by an Agent.
 *
 * Prompts encapsulate the instructions given to an LLM. They can contain
 * template variables (`{name}` placeholders), few-shot examples, and can
 * load their content from external files that are bundled as assets during
 * the build phase.
 *
 * The assembly serializes Prompt as `agentforge::core::Prompt`.
 */
export class Prompt extends AgentResourceBase {
  /** The prompt content (string or asset reference). */
  public readonly content: string | AssetRef;

  /** Template variables. */
  public readonly variables?: Record<string, string>;

  /** Conversation role. */
  public readonly role: PromptRole;

  /** Few-shot examples. */
  public readonly fewShotExamples?: FewShotExample[];

  constructor(scope: Construct, id: string, props: PromptProps) {
    super(scope, id, PROMPT_RESOURCE_TYPE);

    this.content = props.content;
    this.variables = props.variables;
    this.role = props.role ?? 'system';
    this.fewShotExamples = props.fewShotExamples;
  }

  // ─── Factory Methods ────────────────────────────────────────────────────

  /**
   * Create a Prompt whose content is loaded from a file.
   *
   * The file is registered as an asset during the build phase — it will be
   * copied into `agentforge.out/stacks/<stack>/assets/` and the assembly
   * reference will be rewritten to point at the bundled path.
   *
   * @param scope - The construct scope (parent).
   * @param id - Construct ID.
   * @param filePath - Path to the prompt file (relative to project root).
   * @param opts - Optional prompt configuration.
   */
  static fromAsset(
    scope: Construct,
    id: string,
    filePath: string,
    opts?: PromptFromAssetOptions,
  ): Prompt {
    return new Prompt(scope, id, {
      content: new AssetRef(filePath, 'prompt_file'),
      variables: opts?.variables,
      role: opts?.role,
      fewShotExamples: opts?.fewShotExamples,
    });
  }

  // ─── Serialization ──────────────────────────────────────────────────────

  /**
   * Returns the resolved properties for assembly serialization.
   * @internal
   */
  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      role: this.role,
    };

    // Content: serialize either as a plain string or as an asset reference.
    if (typeof this.content === 'string') {
      props.content = this.content;
    } else {
      // AssetRef — the build phase will resolve this to the final asset path.
      props.content = this.content.toJSON();
    }

    if (this.variables !== undefined && Object.keys(this.variables).length > 0) {
      props.variables = { ...this.variables };
    }

    if (this.fewShotExamples !== undefined && this.fewShotExamples.length > 0) {
      props.fewShotExamples = this.fewShotExamples.map((ex) => ({
        user: ex.user,
        assistant: ex.assistant,
      }));
    }

    return props;
  }
}
