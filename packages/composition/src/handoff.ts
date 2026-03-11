/**
 * @module handoff
 *
 * Handoff construct — agent-to-agent or agent-to-human transfer.
 *
 * Defines conditions under which a running agent should transfer control
 * to another agent or a human operator queue. Creates `handoff` connections
 * in the assembly IR.
 *
 * @example
 * ```typescript
 * const handoff = new Handoff(stack, 'Escalation', {
 *   source: supportAgent,
 *   target: HandoffTarget.humanQueue('support-queue'),
 *   triggers: [
 *     HandoffTrigger.sentimentThreshold({ score: -0.7 }),
 *     HandoffTrigger.turnCount({ maxTurns: 10 }),
 *   ],
 *   contextTransfer: { includeFullConversation: true, redactPII: true },
 * });
 * ```
 */

import { Construct } from 'constructs';
import { AgentResourceBase, type AgentForgeDiagnostic, type Connection } from '@agentforge/constructs';
import { Stack } from '@agentforge/constructs';
import type { Agent } from '@agentforge/core';
import type { ContextTransferConfig } from './types.js';
import { HandoffTarget, HandoffTrigger } from './types.js';

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for a {@link Handoff} construct.
 */
export interface HandoffProps {
  /** The source agent that initiates the handoff. */
  readonly source: Agent;

  /** The target of the handoff — another agent or a human queue. */
  readonly target: HandoffTarget;

  /** Conditions that trigger the handoff. */
  readonly triggers: HandoffTrigger[];

  /** Configuration for context transfer. */
  readonly contextTransfer?: ContextTransferConfig;

  /** Human-readable description. */
  readonly description?: string;
}

// ─── Resource Type ──────────────────────────────────────────────────────────

const HANDOFF_RESOURCE_TYPE = 'agentforge::composition::Handoff';

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * Agent-to-agent or agent-to-human transfer with context passing.
 */
export class Handoff extends AgentResourceBase {
  public readonly source: Agent;
  public readonly handoffTarget: HandoffTarget;
  public readonly triggers: HandoffTrigger[];
  public readonly contextTransfer?: ContextTransferConfig;
  public readonly handoffDescription?: string;

  constructor(scope: Construct, id: string, props: HandoffProps) {
    super(scope, id, HANDOFF_RESOURCE_TYPE);

    this.source = props.source;
    this.handoffTarget = props.target;
    this.triggers = [...props.triggers];
    this.contextTransfer = props.contextTransfer;
    this.handoffDescription = props.description;

    // Register dependencies.
    if (this.source) {
      this.addDependency(this.source);
    }
    if (this.handoffTarget.type === 'agent' && this.handoffTarget.agent) {
      this.addDependency(this.handoffTarget.agent);
    }

    // Create handoff connection.
    this.registerConnections(scope);
  }

  private registerConnections(scope: Construct): void {
    const stack = this.findStack(scope);
    if (!stack || !this.source) return;

    // Target path depends on whether it's an agent or human queue.
    const targetPath = this.handoffTarget.type === 'agent' && this.handoffTarget.agent
      ? this.handoffTarget.agent.node.path
      : `__human_queue__/${this.handoffTarget.queueName ?? 'default'}`;

    const connection: Connection = {
      id: `${this.node.path}/handoff`,
      source: this.source.node.path,
      target: targetPath,
      type: 'handoff',
      dataMapping: {
        triggerCount: String(this.triggers.length),
        ...(this.contextTransfer?.includeFullConversation ? { includeFullConversation: 'true' } : {}),
      },
    };

    stack.addConnection(connection);
  }

  private findStack(scope: Construct): Stack | null {
    let current: Construct | undefined = scope instanceof Stack ? scope : undefined;
    if (!current) {
      let node = scope;
      while (node) {
        if (Stack.isStack(node)) {
          current = node;
          break;
        }
        const parent = node.node.scope;
        if (!parent || !(parent instanceof Construct)) break;
        node = parent;
      }
    }
    return (current as Stack) ?? null;
  }

  // ─── Validation ──────────────────────────────────────────────────────

  validate(): AgentForgeDiagnostic[] {
    const diagnostics = super.validate();

    if (!this.source) {
      diagnostics.push({
        code: 'AF604',
        severity: 'error',
        message: `Handoff '${this.displayName}' is missing a source agent.`,
        constructPath: this.node.path,
        suggestedFix: 'Set the `source` property to a valid Agent construct.',
        docsUrl: 'https://agentforge.dev/docs/errors/AF604',
      });
    }

    if (!this.handoffTarget) {
      diagnostics.push({
        code: 'AF604',
        severity: 'error',
        message: `Handoff '${this.displayName}' is missing a target.`,
        constructPath: this.node.path,
        suggestedFix: 'Set the `target` property using HandoffTarget.agent() or HandoffTarget.humanQueue().',
        docsUrl: 'https://agentforge.dev/docs/errors/AF604',
      });
    }

    return diagnostics;
  }

  // ─── Serialization ──────────────────────────────────────────────────

  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      source: this.source?.node?.path,
      target: this.handoffTarget.toJSON(),
      triggers: this.triggers.map(t => t.toJSON()),
    };

    if (this.contextTransfer) {
      props.contextTransfer = { ...this.contextTransfer };
    }

    if (this.handoffDescription) {
      props.description = this.handoffDescription;
    }

    return props;
  }
}
