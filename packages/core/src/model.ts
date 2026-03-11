/**
 * @module model
 *
 * The Model construct represents an LLM configuration decoupled from the Agent.
 * Models define the provider, model ID, and inference parameters, and are
 * referenced by Agents via dependency edges in the assembly.
 *
 * @example
 * ```typescript
 * // Explicit construction
 * const model = new Model(stack, 'Claude', {
 *   provider: 'anthropic',
 *   modelId: 'claude-sonnet-4',
 *   temperature: 0.7,
 *   maxTokens: 4096,
 *   apiKey: SecretRef.env('ANTHROPIC_API_KEY'),
 * });
 *
 * // Factory method
 * const model = Model.anthropic('claude-sonnet-4', { temperature: 0.7 });
 * ```
 */

import { Construct } from 'constructs';
import {
  AgentResourceBase,
  SecretRef,
} from '@agentforge/constructs';

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for a {@link Model} construct.
 */
export interface ModelProps {
  /** LLM provider identifier (e.g., 'anthropic', 'openai', 'google'). */
  readonly provider: string;

  /** Provider-specific model identifier (e.g., 'claude-sonnet-4', 'gpt-4o'). */
  readonly modelId: string;

  /** Sampling temperature. Higher values produce more creative output. */
  readonly temperature?: number;

  /** Maximum number of tokens to generate in a single response. */
  readonly maxTokens?: number;

  /**
   * Secret reference for the provider API key.
   * Must be a {@link SecretRef} — raw strings are rejected during validation.
   */
  readonly apiKey?: SecretRef;

  /**
   * Fallback model to use if this model is unavailable or rate-limited.
   * Creates a dependency edge in the assembly.
   */
  readonly fallback?: Model;
}

/**
 * Optional overrides for Model factory methods.
 */
export interface ModelFactoryOptions {
  /** Sampling temperature. */
  readonly temperature?: number;
  /** Maximum tokens to generate. */
  readonly maxTokens?: number;
  /** Override the default API key secret reference. */
  readonly apiKey?: SecretRef;
  /** Fallback model. */
  readonly fallback?: Model;
}

// ─── Resource Type ──────────────────────────────────────────────────────────

/** Assembly resource type for Model constructs. */
const MODEL_RESOURCE_TYPE = 'agentforge::core::Model';

// ─── Default API key env vars per provider ──────────────────────────────────

const DEFAULT_API_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * An LLM model configuration.
 *
 * Models are decoupled from Agents so that the same model definition can be
 * shared across multiple agents, and model changes (provider swap, parameter
 * tuning) can be made in one place.
 *
 * The assembly serializes Model as `agentforge::core::Model` with properties:
 * `provider`, `modelId`, `temperature`, `maxTokens`, `apiKey` (as SecretRef),
 * and `fallback` (as a dependency ID).
 */
export class Model extends AgentResourceBase {
  /** LLM provider identifier. */
  public readonly provider: string;

  /** Provider-specific model identifier. */
  public readonly modelId: string;

  /** Sampling temperature. */
  public readonly temperature?: number;

  /** Maximum tokens to generate. */
  public readonly maxTokens?: number;

  /** API key secret reference. */
  public readonly apiKey?: SecretRef;

  /** Fallback model. */
  public readonly fallback?: Model;

  constructor(scope: Construct, id: string, props: ModelProps) {
    super(scope, id, MODEL_RESOURCE_TYPE);

    this.provider = props.provider;
    this.modelId = props.modelId;
    this.temperature = props.temperature;
    this.maxTokens = props.maxTokens;
    this.apiKey = props.apiKey;
    this.fallback = props.fallback;

    // Register dependency on the fallback model if present.
    if (this.fallback) {
      this.node.addDependency(this.fallback);
    }
  }

  // ─── Factory Methods ────────────────────────────────────────────────────

  /**
   * Create an Anthropic model with sensible defaults.
   *
   * @param scope - The construct scope (parent).
   * @param id - Construct ID.
   * @param modelId - Anthropic model ID (e.g., 'claude-sonnet-4').
   * @param opts - Optional overrides.
   */
  static anthropic(
    scope: Construct,
    id: string,
    modelId: string,
    opts?: ModelFactoryOptions,
  ): Model {
    return new Model(scope, id, {
      provider: 'anthropic',
      modelId,
      apiKey: opts?.apiKey ?? SecretRef.env(DEFAULT_API_KEY_ENV['anthropic']),
      temperature: opts?.temperature,
      maxTokens: opts?.maxTokens,
      fallback: opts?.fallback,
    });
  }

  /**
   * Create an OpenAI model with sensible defaults.
   *
   * @param scope - The construct scope (parent).
   * @param id - Construct ID.
   * @param modelId - OpenAI model ID (e.g., 'gpt-4o').
   * @param opts - Optional overrides.
   */
  static openai(
    scope: Construct,
    id: string,
    modelId: string,
    opts?: ModelFactoryOptions,
  ): Model {
    return new Model(scope, id, {
      provider: 'openai',
      modelId,
      apiKey: opts?.apiKey ?? SecretRef.env(DEFAULT_API_KEY_ENV['openai']),
      temperature: opts?.temperature,
      maxTokens: opts?.maxTokens,
      fallback: opts?.fallback,
    });
  }

  /**
   * Create a Google model with sensible defaults.
   *
   * @param scope - The construct scope (parent).
   * @param id - Construct ID.
   * @param modelId - Google model ID (e.g., 'gemini-2.0-flash').
   * @param opts - Optional overrides.
   */
  static google(
    scope: Construct,
    id: string,
    modelId: string,
    opts?: ModelFactoryOptions,
  ): Model {
    return new Model(scope, id, {
      provider: 'google',
      modelId,
      apiKey: opts?.apiKey ?? SecretRef.env(DEFAULT_API_KEY_ENV['google']),
      temperature: opts?.temperature,
      maxTokens: opts?.maxTokens,
      fallback: opts?.fallback,
    });
  }

  // ─── Serialization ──────────────────────────────────────────────────────

  /**
   * Returns the resolved properties for assembly serialization.
   * @internal
   */
  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      provider: this.provider,
      modelId: this.modelId,
    };

    if (this.temperature !== undefined) {
      props.temperature = this.temperature;
    }
    if (this.maxTokens !== undefined) {
      props.maxTokens = this.maxTokens;
    }
    if (this.apiKey !== undefined) {
      props.apiKey = this.apiKey.toJSON();
    }
    if (this.fallback !== undefined) {
      props.fallback = this.fallback.node.path;
    }

    return props;
  }
}
