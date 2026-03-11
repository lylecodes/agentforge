/**
 * @module team
 *
 * Team construct — a group of agents with coordination strategy.
 *
 * Teams organize multiple agents under an orchestration strategy:
 * - **Hierarchical**: A manager agent delegates to member agents.
 * - **Collaborative**: Agents work as peers, sharing context.
 * - **Sequential**: Agents execute in order, each building on the previous.
 *
 * Creates `team_membership` connections in the assembly IR.
 *
 * @example
 * ```typescript
 * const team = new Team(stack, 'ContentTeam', {
 *   orchestration: TeamOrchestration.HIERARCHICAL,
 *   manager: editor,
 *   members: [
 *     { agent: researcher, role: 'researcher', maxConcurrent: 3 },
 *     { agent: writer, role: 'writer' },
 *   ],
 *   maxRounds: 10,
 * });
 * ```
 */

import { Construct } from 'constructs';
import { AgentResourceBase, type AgentForgeDiagnostic, type Connection } from '@agentforge/constructs';
import { Stack } from '@agentforge/constructs';
import type { Agent } from '@agentforge/core';
import type { TeamMember } from './types.js';
import { TeamOrchestration } from './types.js';

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for a {@link Team} construct.
 */
export interface TeamProps {
  /** Orchestration strategy. */
  readonly orchestration: TeamOrchestration;

  /** Manager agent (required for hierarchical, optional otherwise). */
  readonly manager?: Agent;

  /** Team members. */
  readonly members: TeamMember[];

  /** Maximum orchestration rounds before stopping (default: 10). */
  readonly maxRounds?: number;

  /** Human-readable description. */
  readonly description?: string;
}

// ─── Resource Type ──────────────────────────────────────────────────────────

const TEAM_RESOURCE_TYPE = 'agentforge::composition::Team';

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * A group of agents with a coordination strategy.
 */
export class Team extends AgentResourceBase {
  public readonly orchestration: TeamOrchestration;
  public readonly manager?: Agent;
  public readonly members: TeamMember[];
  public readonly maxRounds: number;
  public readonly teamDescription?: string;

  constructor(scope: Construct, id: string, props: TeamProps) {
    super(scope, id, TEAM_RESOURCE_TYPE);

    this.orchestration = props.orchestration;
    this.manager = props.manager;
    this.members = [...props.members];
    this.maxRounds = props.maxRounds ?? 10;
    this.teamDescription = props.description;

    // Register dependencies.
    if (this.manager) {
      this.addDependency(this.manager);
    }
    for (const member of this.members) {
      this.addDependency(member.agent);
    }

    // Create team_membership connections.
    this.registerConnections(scope);
  }

  private registerConnections(scope: Construct): void {
    const stack = this.findStack(scope);
    if (!stack) return;

    for (let i = 0; i < this.members.length; i++) {
      const member = this.members[i]!;

      // Source depends on orchestration:
      // - Hierarchical: manager -> member
      // - Collaborative: team resource -> member (star topology)
      // - Sequential: ordered chain
      const source = this.orchestration === TeamOrchestration.HIERARCHICAL && this.manager
        ? this.manager.node.path
        : this.node.path;

      const connection: Connection = {
        id: `${this.node.path}/member-${i}`,
        source,
        target: member.agent.node.path,
        type: 'team_membership',
        order: i,
        dataMapping: {
          role: member.role,
          ...(member.maxConcurrent ? { maxConcurrent: String(member.maxConcurrent) } : {}),
        },
      };

      stack.addConnection(connection);
    }
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

    if (this.members.length === 0) {
      diagnostics.push({
        code: 'AF602',
        severity: 'error',
        message: `Team '${this.displayName}' has no members.`,
        constructPath: this.node.path,
        suggestedFix: 'Add at least one member to the Team construct.',
        docsUrl: 'https://agentforge.dev/docs/errors/AF602',
      });
    }

    if (this.orchestration === TeamOrchestration.HIERARCHICAL && !this.manager) {
      diagnostics.push({
        code: 'AF602',
        severity: 'warning',
        message: `Team '${this.displayName}' uses hierarchical orchestration but has no manager. A member will be auto-selected as manager at runtime.`,
        constructPath: this.node.path,
        suggestedFix: 'Set the `manager` property on the Team construct for hierarchical orchestration.',
        docsUrl: 'https://agentforge.dev/docs/errors/AF602',
      });
    }

    return diagnostics;
  }

  // ─── Serialization ──────────────────────────────────────────────────

  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      orchestration: this.orchestration,
      members: this.members.map((m, i) => ({
        agentPath: m.agent.node.path,
        agentName: m.agent.agentName,
        role: m.role,
        maxConcurrent: m.maxConcurrent ?? 1,
        order: i,
      })),
      maxRounds: this.maxRounds,
    };

    if (this.manager) {
      props.manager = this.manager.node.path;
    }

    if (this.teamDescription) {
      props.description = this.teamDescription;
    }

    return props;
  }
}
