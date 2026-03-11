/**
 * @module resource
 *
 * Base AgentResource class — the foundation for all AgentForge resource
 * constructs.
 *
 * Extends the `constructs` library's Construct class to add:
 * - A fully-qualified resource type (`agentforge::<layer>::<Type>`)
 * - A properties bag for resource-specific configuration
 * - Dependency tracking between resources
 * - Secret reference tracking
 * - Asset reference tracking
 * - Serialization to the Agent Assembly IR format
 *
 * @see Section 2.2 and Phase 1 item 1.2 of the AgentForge roadmap.
 */

import { Construct } from 'constructs';
import type {
  AgentResource as AgentResourceData,
  SecretRefEntry,
  AssetRefEntry,
} from './assembly.js';
import type { AgentForgeDiagnostic } from './errors.js';
import type { IValidatable } from './validation.js';
import { validateSecrets } from './validation.js';
import { isSecretRef } from './secrets.js';
import type { SecretRef } from './secrets.js';

// ─── Resource Base Class ────────────────────────────────────────────────────

/**
 * Base class for all AgentForge resource constructs.
 *
 * Every concrete resource (Agent, Model, Tool, Prompt, etc.) extends this
 * class. It provides the common structure needed for synthesis: a resource
 * type, properties, dependency ordering, and secret/asset tracking.
 *
 * @example
 * ```ts
 * class MyAgent extends AgentResourceBase {
 *   constructor(scope: Construct, id: string, props: MyAgentProps) {
 *     super(scope, id, 'agentforge::core::Agent');
 *     this.addProperty('name', props.name);
 *     this.addProperty('description', props.description);
 *   }
 * }
 * ```
 */
export abstract class AgentResourceBase extends Construct implements IValidatable {
  /**
   * Fully qualified resource type.
   *
   * Convention: `agentforge::<layer>::<Type>`
   *
   * @example "agentforge::core::Agent"
   * @example "agentforge::composition::Workflow"
   */
  public readonly resourceType: string;

  /** Human-readable display name (defaults to the construct ID). */
  public readonly displayName: string;

  /** Resource-specific properties. */
  protected readonly properties: Record<string, unknown> = {};

  /** IDs of resources this resource depends on. */
  private readonly _dependencies: Set<string> = new Set();

  /** Secret references used by this resource. */
  private readonly _secretRefs: SecretRefEntry[] = [];

  /** Asset references used by this resource. */
  private readonly _assetRefs: AssetRefEntry[] = [];

  /** Construct-level metadata (target hints, user annotations). */
  private readonly _metadata: Record<string, unknown> = {};

  /**
   * @param scope        - Parent construct (Stack or another Construct).
   * @param id           - Unique identifier within the parent scope.
   * @param resourceType - Fully qualified resource type string.
   * @param displayName  - Optional human-readable display name.
   */
  constructor(
    scope: Construct,
    id: string,
    resourceType: string,
    displayName?: string,
  ) {
    super(scope, id);
    this.resourceType = resourceType;
    this.displayName = displayName ?? id;
  }

  // ─── Properties ───────────────────────────────────────────────────────

  /**
   * Set a property value on this resource.
   *
   * If the value is a {@link SecretRef}, it is automatically tracked in
   * the resource's secretRefs list.
   */
  protected addProperty(key: string, value: unknown): void {
    this.properties[key] = value;

    // Auto-track SecretRef values
    if (isSecretRef(value)) {
      this.addSecretRef(value, `properties.${key}`);
    }
  }

  /**
   * Get the current properties.
   */
  getProperties(): Record<string, unknown> {
    return { ...this.properties };
  }

  // ─── Dependencies ─────────────────────────────────────────────────────

  /**
   * Declare that this resource depends on another resource.
   *
   * Dependencies affect build ordering — a resource's dependencies are
   * always processed before it.
   *
   * @param resource - The resource to depend on (by instance or ID string).
   */
  addDependency(resource: AgentResourceBase | string): void {
    const id = typeof resource === 'string' ? resource : resource.node.path;
    this._dependencies.add(id);
  }

  /**
   * Get all dependency IDs.
   */
  get dependencies(): string[] {
    return Array.from(this._dependencies);
  }

  // ─── Secret References ────────────────────────────────────────────────

  /**
   * Register a secret reference used by this resource.
   *
   * @param secretRef    - The SecretRef instance.
   * @param propertyPath - The property path where the secret is used.
   */
  addSecretRef(secretRef: SecretRef, propertyPath: string): void {
    this._secretRefs.push({
      name: secretRef.name,
      source: secretRef.source,
      propertyPath,
    });
  }

  /**
   * Get all secret references.
   */
  get secretRefs(): SecretRefEntry[] {
    return [...this._secretRefs];
  }

  // ─── Asset References ─────────────────────────────────────────────────

  /**
   * Register an asset reference used by this resource.
   *
   * @param assetRef - The asset reference entry.
   */
  addAssetRef(assetRef: AssetRefEntry): void {
    this._assetRefs.push(assetRef);
  }

  /**
   * Get all asset references.
   */
  get assetRefs(): AssetRefEntry[] {
    return [...this._assetRefs];
  }

  // ─── Metadata ─────────────────────────────────────────────────────────

  /**
   * Set a metadata value on this resource.
   *
   * Metadata is extensible and used for target hints, user annotations,
   * and other non-core data.
   */
  addMetadata(key: string, value: unknown): void {
    this._metadata[key] = value;
  }

  /**
   * Get all metadata.
   */
  get metadata(): Record<string, unknown> {
    return { ...this._metadata };
  }

  // ─── Validation ───────────────────────────────────────────────────────

  /**
   * Validate this resource.
   *
   * Subclasses should override this to add resource-specific validation.
   * Always call `super.validate()` to include base validation (secret
   * leak detection).
   *
   * @returns An array of diagnostics.
   */
  validate(): AgentForgeDiagnostic[] {
    const diagnostics: AgentForgeDiagnostic[] = [];

    // Check for leaked secrets in properties
    diagnostics.push(
      ...validateSecrets(this.properties, this.node.path),
    );

    return diagnostics;
  }

  // ─── Serialization ───────────────────────────────────────────────────

  /**
   * Resolve the properties for assembly serialization.
   *
   * Subclasses should override this to return their resource-specific
   * properties. The default implementation returns the base class
   * properties bag (populated via {@link addProperty}).
   *
   * @returns The resolved property values for this resource.
   */
  protected resolveProperties(): Record<string, unknown> {
    return { ...this.properties };
  }

  /**
   * Serialize this resource to the Agent Assembly IR format.
   *
   * This produces the JSON-serializable representation used in
   * `assembly.json`. All properties are included as-is — token resolution
   * and asset path rewriting happen in a separate pass.
   *
   * @returns An {@link AgentResourceData} object.
   */
  toAssemblyResource(): AgentResourceData {
    // Call resolveProperties() so subclasses can provide their own properties
    const resolved = this.resolveProperties();

    // Serialize properties, converting SecretRef instances to JSON
    const serializedProperties = this.serializeProperties(resolved);

    return {
      type: this.resourceType,
      id: this.node.path,
      displayName: this.displayName,
      properties: serializedProperties as Record<string, unknown>,
      dependencies: this.dependencies,
      metadata: { ...this._metadata },
      secretRefs: [...this._secretRefs],
      assetRefs: [...this._assetRefs],
    };
  }

  /**
   * Recursively serialize properties, converting SecretRef instances
   * to their JSON representation.
   */
  private serializeProperties(value: unknown): unknown {
    if (isSecretRef(value)) {
      return value.toJSON();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.serializeProperties(item));
    }

    if (typeof value === 'object' && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.serializeProperties(val);
      }
      return result;
    }

    return value;
  }
}
