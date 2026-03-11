/**
 * @module router
 *
 * Router construct — conditional dispatch to agents.
 *
 * Routes incoming requests to different agents based on rules or LLM
 * classification. Creates `router_route` connections in the assembly IR
 * with conditions on each edge.
 *
 * @example
 * ```typescript
 * const router = new Router(stack, 'TaskRouter', {
 *   strategy: RoutingStrategy.LLM_BASED,
 *   routingModel: Model.anthropic('claude-haiku-3'),
 *   routes: [
 *     { name: 'research', description: 'Research requests', target: researcher },
 *     { name: 'writing', description: 'Writing tasks', target: writer },
 *   ],
 *   defaultRoute: editor,
 * });
 * ```
 */

import { Construct } from 'constructs';
import { AgentResourceBase, Stack } from '@agentforge/constructs';
import type { AgentForgeDiagnostic, Connection } from '@agentforge/constructs';
import type { Agent, Model } from '@agentforge/core';
import type { Route } from './types.js';
import { RoutingStrategy } from './types.js';

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for a {@link Router} construct.
 */
export interface RouterProps {
  /** Routing strategy. */
  readonly strategy: RoutingStrategy;

  /** Model used for LLM-based routing classification (required for LLM_BASED). */
  readonly routingModel?: Model;

  /** Named routes to target agents. */
  readonly routes: Route[];

  /** Default target when no route matches. */
  readonly defaultRoute?: Agent;

  /** Human-readable description. */
  readonly description?: string;
}

// ─── Resource Type ──────────────────────────────────────────────────────────

const ROUTER_RESOURCE_TYPE = 'agentforge::composition::Router';

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * Conditional dispatch to agents based on rules or LLM classification.
 */
export class Router extends AgentResourceBase {
  public readonly strategy: RoutingStrategy;
  public readonly routingModel?: Model;
  public readonly routes: Route[];
  public readonly defaultRoute?: Agent;
  public readonly routerDescription?: string;

  constructor(scope: Construct, id: string, props: RouterProps) {
    super(scope, id, ROUTER_RESOURCE_TYPE);

    this.strategy = props.strategy;
    this.routingModel = props.routingModel;
    this.routes = [...props.routes];
    this.defaultRoute = props.defaultRoute;
    this.routerDescription = props.description;

    // Register dependencies.
    for (const route of this.routes) {
      this.addDependency(route.target);
    }
    if (this.defaultRoute) {
      this.addDependency(this.defaultRoute);
    }
    if (this.routingModel) {
      this.addDependency(this.routingModel);
    }

    // Create router_route connections.
    this.registerConnections(scope);
  }

  private registerConnections(scope: Construct): void {
    const stack = this.findStack(scope);
    if (!stack) return;

    for (let i = 0; i < this.routes.length; i++) {
      const route = this.routes[i]!;

      const connection: Connection = {
        id: `${this.node.path}/route-${route.name}`,
        source: this.node.path,
        target: route.target.node.path,
        type: 'router_route',
        condition: route.condition,
        order: i,
        dataMapping: {
          routeName: route.name,
          routeDescription: route.description,
        },
      };

      stack.addConnection(connection);
    }

    // Default route.
    if (this.defaultRoute) {
      const connection: Connection = {
        id: `${this.node.path}/route-default`,
        source: this.node.path,
        target: this.defaultRoute.node.path,
        type: 'router_route',
        condition: '__default__',
        order: this.routes.length,
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

    if (this.routes.length === 0) {
      diagnostics.push({
        code: 'AF603',
        severity: 'error',
        message: `Router '${this.displayName}' has no routes.`,
        constructPath: this.node.path,
        suggestedFix: 'Add at least one route to the Router construct.',
        docsUrl: 'https://agentforge.dev/errors/AF603',
      });
    }

    if (this.strategy === RoutingStrategy.LLM_BASED && !this.routingModel) {
      diagnostics.push({
        code: 'AF603',
        severity: 'warning',
        message: `Router '${this.displayName}' uses LLM-based routing but no routingModel is specified. The first agent's model will be used.`,
        constructPath: this.node.path,
        suggestedFix: 'Set the `routingModel` property for LLM-based routing.',
        docsUrl: 'https://agentforge.dev/errors/AF603',
      });
    }

    return diagnostics;
  }

  // ─── Serialization ──────────────────────────────────────────────────

  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      strategy: this.strategy,
      routes: this.routes.map(r => ({
        name: r.name,
        description: r.description,
        targetPath: r.target.node.path,
        targetName: r.target.agentName,
        condition: r.condition,
      })),
    };

    if (this.routingModel) {
      props.routingModel = this.routingModel.node.path;
    }

    if (this.defaultRoute) {
      props.defaultRoute = this.defaultRoute.node.path;
      props.defaultRouteName = this.defaultRoute.agentName;
    }

    if (this.routerDescription) {
      props.description = this.routerDescription;
    }

    return props;
  }
}
