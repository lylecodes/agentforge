/**
 * @module stack
 *
 * Stack — a deployment unit within an AgentForge application.
 *
 * A Stack groups related agent resources for deployment to a specific
 * environment and target. Each Stack produces its own `assembly.json`
 * in the build output.
 *
 * @see Phase 1 item 1.2 of the AgentForge roadmap.
 */

import { Construct } from 'constructs';
import type {
  AgentAssembly,
  AgentResource as AgentResourceData,
  Connection,
  Parameter,
  ProtocolArtifacts,
} from './assembly.js';
import { ASSEMBLY_VERSION } from './assembly.js';
import { AgentResourceBase } from './resource.js';
import type { AgentForgeDiagnostic } from './errors.js';

// ─── Stack Props ────────────────────────────────────────────────────────────

/**
 * Configuration properties for a Stack.
 */
export interface StackProps {
  /**
   * The deployment environment name.
   * @example "development", "staging", "production"
   */
  readonly environment?: string;

  /**
   * Stack-level configuration that can be referenced by child constructs.
   * Useful for environment-specific overrides (model selection, feature flags).
   */
  readonly config?: Record<string, unknown>;

  /**
   * Target compiler hint(s).
   * Informational — used in assembly metadata to indicate intended targets.
   */
  readonly targets?: string[];

  /** Human-readable description of this stack. */
  readonly description?: string;
}

// ─── Stack Class ────────────────────────────────────────────────────────────

/**
 * A deployment unit that groups related agent resources.
 *
 * Stacks are children of an {@link App} and represent a self-contained
 * set of resources that are deployed together. Each stack produces its
 * own assembly directory containing `assembly.json`, `assets/`, and
 * protocol artifacts.
 *
 * @example
 * ```ts
 * const app = new App();
 *
 * const dev = new Stack(app, 'Dev', {
 *   environment: 'development',
 *   config: { model: 'anthropic/claude-haiku-3' },
 * });
 *
 * const prod = new Stack(app, 'Prod', {
 *   environment: 'production',
 *   config: { model: 'anthropic/claude-sonnet-4' },
 *   targets: ['docker', 'kubernetes'],
 * });
 * ```
 */
export class Stack extends Construct {
  /** The deployment environment name. */
  public readonly environment: string | undefined;

  /** Stack-level configuration. */
  public readonly config: Record<string, unknown>;

  /** Intended target compiler(s). */
  public readonly targets: string[];

  /** Human-readable description. */
  public readonly description: string | undefined;

  /** Connections registered in this stack. */
  private readonly _connections: Connection[] = [];

  /** Parameters registered in this stack. */
  private readonly _parameters: Map<string, Parameter> = new Map();

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id);
    this.environment = props?.environment;
    this.config = props?.config ?? {};
    this.targets = props?.targets ?? [];
    this.description = props?.description;
  }

  // ─── Connections ────────────────────────────────────────────────────────

  /**
   * Register a connection (directed edge) between two resources in this stack.
   *
   * @param connection - The connection to register.
   */
  addConnection(connection: Connection): void {
    this._connections.push(connection);
  }

  /**
   * Get all registered connections.
   */
  get connections(): Connection[] {
    return [...this._connections];
  }

  // ─── Parameters ────────────────────────────────────────────────────────

  /**
   * Register a deploy-time parameter.
   *
   * @param parameter - The parameter to register.
   */
  addParameter(parameter: Parameter): void {
    this._parameters.set(parameter.name, parameter);
  }

  /**
   * Get all registered parameters.
   */
  get parameters(): Record<string, Parameter> {
    const result: Record<string, Parameter> = {};
    for (const [name, param] of this._parameters.entries()) {
      result[name] = param;
    }
    return result;
  }

  // ─── Resource Collection ───────────────────────────────────────────────

  /**
   * Walk all child constructs and collect AgentResource serializations.
   *
   * Recursively traverses the construct tree rooted at this stack and
   * calls `toAssemblyResource()` on every {@link AgentResourceBase}
   * descendant.
   *
   * @returns A record of resources keyed by construct path.
   */
  collectResources(): Record<string, AgentResourceData> {
    const resources: Record<string, AgentResourceData> = {};
    this.collectResourcesRecursive(this, resources);
    return resources;
  }

  /**
   * Walk all child constructs and collect validation diagnostics.
   *
   * @returns An array of all diagnostics from child resources.
   */
  collectDiagnostics(): AgentForgeDiagnostic[] {
    const diagnostics: AgentForgeDiagnostic[] = [];
    this.collectDiagnosticsRecursive(this, diagnostics);
    return diagnostics;
  }

  /**
   * Synthesize this stack into an AgentAssembly structure.
   *
   * This is called by {@link App.build}. It collects all resources,
   * connections, and parameters, and produces the assembly data structure.
   * The assembly hash and protocol artifacts are populated by the caller.
   *
   * @param agentforgeVersion - The AgentForge version string.
   * @param protocols         - Generated protocol artifacts.
   * @returns The complete AgentAssembly for this stack.
   */
  synthesize(
    agentforgeVersion: string,
    protocols: ProtocolArtifacts = {},
  ): AgentAssembly {
    return {
      version: ASSEMBLY_VERSION,
      metadata: {
        stackName: this.node.id,
        assemblyHash: '', // Computed after full serialization
        synthesizedAt: new Date().toISOString(),
        agentforgeVersion,
        intendedTargets: this.targets.length > 0 ? this.targets : undefined,
      },
      resources: this.collectResources(),
      connections: [...this._connections],
      parameters: this.parameters,
      protocols,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * Recursively collect resources from the construct tree.
   */
  private collectResourcesRecursive(
    construct: Construct,
    resources: Record<string, AgentResourceData>,
  ): void {
    if (construct instanceof AgentResourceBase) {
      const data = construct.toAssemblyResource();
      resources[data.id] = data;
    }

    for (const child of construct.node.children) {
      if (child instanceof Construct) {
        this.collectResourcesRecursive(child, resources);
      }
    }
  }

  /**
   * Recursively collect validation diagnostics from the construct tree.
   */
  private collectDiagnosticsRecursive(
    construct: Construct,
    diagnostics: AgentForgeDiagnostic[],
  ): void {
    if (construct instanceof AgentResourceBase) {
      diagnostics.push(...construct.validate());
    }

    for (const child of construct.node.children) {
      if (child instanceof Construct) {
        this.collectDiagnosticsRecursive(child, diagnostics);
      }
    }
  }

  // ─── Static Helpers ───────────────────────────────────────────────────

  /**
   * Check whether a construct is a Stack.
   */
  static isStack(construct: Construct): construct is Stack {
    return construct instanceof Stack;
  }
}
