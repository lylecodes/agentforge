/**
 * @module aspects
 *
 * Aspects — the visitor pattern for cross-cutting concerns.
 *
 * The `constructs` package (v10.4+) uses Mixins instead of the legacy
 * Aspects pattern. AgentForge provides its own Aspects implementation
 * following the CDK convention: an aspect visits every node in a
 * construct tree and can inspect or mutate them.
 *
 * Aspects are used for things like:
 * - Applying guardrails to all agents in a stack
 * - Enforcing policies across all resources
 * - Adding monitoring to all agents
 * - Injecting metadata for compliance
 *
 * @see Section 2.1 of the AgentForge roadmap.
 */

import type { IConstruct } from 'constructs';

// Re-export for consumers
export type { IConstruct };

// ─── IAspect Interface ──────────────────────────────────────────────────────

/**
 * An aspect that can be applied to a construct tree.
 *
 * Implement this interface to create aspects that visit all constructs
 * in a subtree. The `visit` method is called once per construct during
 * aspect invocation.
 *
 * @example
 * ```ts
 * class LoggingAspect implements IAspect {
 *   visit(node: IConstruct): void {
 *     if (node instanceof AgentResourceBase) {
 *       node.addMetadata('logging', { enabled: true });
 *     }
 *   }
 * }
 * ```
 */
export interface IAspect {
  /**
   * Called for each construct in the tree when the aspect is applied.
   *
   * @param node - The construct being visited.
   */
  visit(node: IConstruct): void;
}

// ─── Aspects Registry ───────────────────────────────────────────────────────

/**
 * Internal storage key for aspects on a construct.
 * Uses a Symbol to avoid property name collisions.
 */
const ASPECTS_SYMBOL = Symbol.for('@agentforge/constructs.aspects');

/**
 * Manages aspects registered on a construct.
 *
 * Use `Aspects.of(construct)` to get the aspect collection, then `.add()`
 * to register an aspect. Call `Aspects.invokeAll(root)` to visit all
 * constructs with their registered aspects.
 *
 * @example
 * ```ts
 * Aspects.of(stack).add(new GuardrailAspect(myGuardrail));
 *
 * // During build, invoke all aspects
 * Aspects.invokeAll(app);
 * ```
 */
export class Aspects {
  /**
   * Get the aspect collection for a construct.
   * Creates a new collection if one does not already exist.
   *
   * @param scope - The construct to get aspects for.
   * @returns The Aspects instance for the given construct.
   */
  static of(scope: IConstruct): Aspects {
    const record = scope as unknown as Record<symbol, Aspects>;
    let aspects = record[ASPECTS_SYMBOL];
    if (!aspects) {
      aspects = new Aspects();
      record[ASPECTS_SYMBOL] = aspects;
    }
    return aspects;
  }

  /**
   * Invoke all aspects on a construct tree.
   *
   * Walks the tree in pre-order (parent before children). For each
   * construct, all aspects registered on it and on its ancestors are
   * invoked.
   *
   * @param root - The root construct to start from.
   */
  static invokeAll(root: IConstruct): void {
    invokeAspectsRecursive(root, []);
  }

  /** The aspects registered on this construct. */
  private readonly _aspects: IAspect[] = [];

  /**
   * Register an aspect on this construct.
   *
   * The aspect will be invoked on all descendants when
   * `Aspects.invokeAll()` is called on an ancestor.
   *
   * @param aspect - The aspect to register.
   */
  add(aspect: IAspect): void {
    this._aspects.push(aspect);
  }

  /**
   * Get all aspects registered directly on this construct.
   */
  get all(): IAspect[] {
    return [...this._aspects];
  }
}

/**
 * Recursively invoke aspects on a construct tree.
 *
 * @param construct       - The current construct.
 * @param inheritedAspects - Aspects inherited from ancestor constructs.
 */
function invokeAspectsRecursive(
  construct: IConstruct,
  inheritedAspects: IAspect[],
): void {
  // Collect aspects from this construct
  const record = construct as unknown as Record<symbol, Aspects | undefined>;
  const localAspects = record[ASPECTS_SYMBOL]?.all ?? [];

  // Merge inherited + local
  const allAspects = [...inheritedAspects, ...localAspects];

  // Invoke all aspects on this construct
  for (const aspect of allAspects) {
    aspect.visit(construct);
  }

  // Recurse into children
  for (const child of construct.node.children) {
    invokeAspectsRecursive(child, allAspects);
  }
}

// ─── Aspect Helpers ─────────────────────────────────────────────────────────

/**
 * Apply an aspect to a construct and all of its descendants.
 *
 * Convenience wrapper around `Aspects.of(scope).add(aspect)`.
 *
 * @param scope  - The construct (usually a Stack) to apply the aspect to.
 * @param aspect - The aspect to apply.
 */
export function applyAspect(scope: IConstruct, aspect: IAspect): void {
  Aspects.of(scope).add(aspect);
}

/**
 * Apply multiple aspects to a construct.
 *
 * @param scope   - The construct to apply aspects to.
 * @param aspects - The aspects to apply.
 */
export function applyAspects(scope: IConstruct, aspects: IAspect[]): void {
  const collection = Aspects.of(scope);
  for (const aspect of aspects) {
    collection.add(aspect);
  }
}

// ─── Abstract Aspect Base ───────────────────────────────────────────────────

/**
 * Base class for AgentForge aspects that want to filter by resource type.
 *
 * Subclasses implement {@link visitResource} which is only called for
 * constructs that are instances of {@link AgentResourceBase}.
 *
 * @example
 * ```ts
 * class LoggingAspect extends ResourceAspect {
 *   visitResource(resource: IConstruct): void {
 *     (resource as AgentResourceBase).addMetadata('logging', { enabled: true });
 *   }
 * }
 * ```
 */
export abstract class ResourceAspect implements IAspect {
  visit(node: IConstruct): void {
    // Duck-type check for AgentResourceBase to avoid circular imports
    if (this.isAgentResource(node)) {
      this.visitResource(node);
    }
  }

  /**
   * Called for each AgentResourceBase in the construct tree.
   * Override this in subclasses to implement the aspect behavior.
   */
  protected abstract visitResource(resource: IConstruct): void;

  /**
   * Duck-type check for AgentResourceBase.
   */
  private isAgentResource(node: IConstruct): boolean {
    return (
      'resourceType' in node &&
      'toAssemblyResource' in node &&
      typeof (node as Record<string, unknown>).resourceType === 'string' &&
      typeof (node as Record<string, unknown>).toAssemblyResource === 'function'
    );
  }
}
