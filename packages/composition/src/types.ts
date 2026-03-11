/**
 * @module types
 *
 * Shared types for composition constructs — enums for orchestration
 * strategies, routing modes, error handling, and handoff configuration.
 */

import type { Agent } from '@agentforge/core';

// ─── Workflow Types ──────────────────────────────────────────────────────────

/**
 * Error handling strategy for workflow steps.
 */
export type WorkflowErrorHandling = 'retry' | 'skip' | 'abort';

/**
 * A single step in a workflow pipeline.
 */
export interface WorkflowStep {
  /** The agent to execute at this step. */
  readonly agent: Agent;

  /** Task description / instruction for this step. Supports `{variable}` placeholders. */
  readonly task: string;

  /** Optional step name for identification in connections. */
  readonly name?: string;
}

// ─── Team Types ──────────────────────────────────────────────────────────────

/**
 * Team orchestration strategy.
 */
export enum TeamOrchestration {
  /** Manager delegates tasks to members, aggregates results. */
  HIERARCHICAL = 'hierarchical',

  /** Members collaborate as peers, passing work between each other. */
  COLLABORATIVE = 'collaborative',

  /** Members execute in sequence, each building on the previous result. */
  SEQUENTIAL = 'sequential',
}

/**
 * A member of a team.
 */
export interface TeamMember {
  /** The agent that is a team member. */
  readonly agent: Agent;

  /** Role description within the team. */
  readonly role: string;

  /** Maximum concurrent executions for this member (default: 1). */
  readonly maxConcurrent?: number;
}

// ─── Router Types ────────────────────────────────────────────────────────────

/**
 * Routing strategy for dispatching inputs to agents.
 */
export enum RoutingStrategy {
  /** Route based on explicit rules/conditions. */
  RULE_BASED = 'rule_based',

  /** Route using an LLM to classify intent. */
  LLM_BASED = 'llm_based',
}

/**
 * A single route in a router.
 */
export interface Route {
  /** Unique route name. */
  readonly name: string;

  /** Description of what this route handles (used by LLM-based routing). */
  readonly description: string;

  /** Target agent for this route. */
  readonly target: Agent;

  /** Explicit condition expression for rule-based routing. */
  readonly condition?: string;
}

// ─── Handoff Types ───────────────────────────────────────────────────────────

/**
 * Target of a handoff — either another agent or a human queue.
 */
export class HandoffTarget {
  private constructor(
    public readonly type: 'agent' | 'human_queue',
    public readonly agent?: Agent,
    public readonly queueName?: string,
  ) {}

  /** Handoff to another agent. */
  static agent(agent: Agent): HandoffTarget {
    return new HandoffTarget('agent', agent);
  }

  /** Handoff to a human operator queue. */
  static humanQueue(queueName: string): HandoffTarget {
    return new HandoffTarget('human_queue', undefined, queueName);
  }

  /** Serialize for assembly properties. */
  toJSON(): Record<string, unknown> {
    if (this.type === 'agent' && this.agent) {
      return { type: 'agent', agentPath: this.agent.node.path };
    }
    return { type: 'human_queue', queueName: this.queueName };
  }
}

/**
 * Trigger condition for a handoff.
 */
export class HandoffTrigger {
  private constructor(
    public readonly type: string,
    public readonly config: Record<string, unknown>,
  ) {}

  /** Trigger when sentiment drops below a threshold. */
  static sentimentThreshold(opts: { score: number }): HandoffTrigger {
    return new HandoffTrigger('sentiment_threshold', { score: opts.score });
  }

  /** Trigger after a maximum number of conversation turns. */
  static turnCount(opts: { maxTurns: number }): HandoffTrigger {
    return new HandoffTrigger('turn_count', { maxTurns: opts.maxTurns });
  }

  /** Trigger on explicit user request (e.g., "talk to a human"). */
  static userRequest(): HandoffTrigger {
    return new HandoffTrigger('user_request', {});
  }

  /** Trigger on a custom condition expression. */
  static custom(condition: string): HandoffTrigger {
    return new HandoffTrigger('custom', { condition });
  }

  /** Serialize for assembly properties. */
  toJSON(): Record<string, unknown> {
    return { type: this.type, ...this.config };
  }
}

/**
 * Configuration for context transfer during a handoff.
 */
export interface ContextTransferConfig {
  /** Include the full conversation history in the handoff. */
  readonly includeFullConversation?: boolean;

  /** Redact PII from the transferred context. */
  readonly redactPII?: boolean;

  /** Maximum number of recent messages to include (if not full conversation). */
  readonly maxMessages?: number;

  /** Custom metadata to include in the handoff. */
  readonly metadata?: Record<string, unknown>;
}
