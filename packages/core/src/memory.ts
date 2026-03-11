/**
 * @module memory
 *
 * The Memory construct represents a memory backend configuration for an Agent.
 * Memory enables agents to persist and retrieve conversational context, entity
 * information, summaries, or buffered messages across interactions.
 *
 * @example
 * ```typescript
 * const memory = new Memory(stack, 'ConvMemory', {
 *   type: MemoryType.CONVERSATION,
 *   backend: 'sqlite',
 *   maxTokens: 4096,
 *   config: { dbPath: './data/memory.db' },
 * });
 * ```
 */

import { type Construct } from 'constructs';
import { AgentResourceBase } from '@agentforge/constructs';

// ─── Resource Type ──────────────────────────────────────────────────────────

/** Assembly resource type for Memory constructs. */
const MEMORY_RESOURCE_TYPE = 'agentforge::core::Memory';

// ─── Memory Type Enum ───────────────────────────────────────────────────────

/**
 * The type of memory strategy used by the agent.
 */
export enum MemoryType {
  /** Full conversation history (all messages). */
  CONVERSATION = 'conversation',

  /** Summarized conversation history (compressed via LLM). */
  SUMMARY = 'summary',

  /** Entity-based memory (tracks facts about entities). */
  ENTITY = 'entity',

  /** Sliding window buffer of recent messages. */
  BUFFER = 'buffer',
}

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for a {@link Memory} construct.
 */
export interface MemoryProps {
  /** The memory strategy type. */
  readonly type: MemoryType;

  /** Storage backend for persisting memory state. */
  readonly backend: 'sqlite' | 'redis' | 'postgres';

  /** Maximum token budget for memory content (used by summary/buffer types). */
  readonly maxTokens?: number;

  /** Backend-specific configuration (e.g., connection strings, paths). */
  readonly config?: Record<string, unknown>;
}

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * A memory configuration for an Agent.
 *
 * Memory constructs define how an agent persists and retrieves context
 * across interactions. Different memory types serve different use cases:
 * conversation history, summarization, entity tracking, or buffered windows.
 *
 * The assembly serializes Memory as `agentforge::core::Memory`.
 */
export class Memory extends AgentResourceBase {
  /** The memory strategy type. */
  public readonly memoryType: MemoryType;

  /** Storage backend identifier. */
  public readonly backend: string;

  /** Maximum token budget for memory content. */
  public readonly maxTokens?: number;

  /** Backend-specific configuration. */
  public readonly memoryConfig?: Record<string, unknown>;

  constructor(scope: Construct, id: string, props: MemoryProps) {
    super(scope, id, MEMORY_RESOURCE_TYPE);

    this.memoryType = props.type;
    this.backend = props.backend;
    this.maxTokens = props.maxTokens;
    this.memoryConfig = props.config;
  }

  // ─── Serialization ──────────────────────────────────────────────────────

  /**
   * Returns the resolved properties for assembly serialization.
   * @internal
   */
  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      type: this.memoryType,
      backend: this.backend,
    };

    if (this.maxTokens !== undefined) {
      props.maxTokens = this.maxTokens;
    }
    if (this.memoryConfig !== undefined) {
      props.config = this.memoryConfig;
    }

    return props;
  }
}
