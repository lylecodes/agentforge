/**
 * @module asset-ref
 *
 * AssetRef — a marker object that describes a file asset to be bundled into
 * the assembly at build time. Similar to SecretRef, it is a lightweight
 * descriptor that the synthesis engine resolves into an actual asset entry.
 *
 * @see Section 2.9 of the AgentForge roadmap.
 */

import type { AssetType } from './assembly.js';

// ─── Sentinel ───────────────────────────────────────────────────────────────

/**
 * Marker property used to identify serialized AssetRef objects in JSON.
 */
const ASSET_REF_MARKER = '__agentforge_asset_ref__' as const;

// ─── AssetRef Class ─────────────────────────────────────────────────────────

/**
 * A reference to a file asset that will be bundled into the assembly.
 *
 * AssetRef objects are placed in construct properties wherever a file
 * reference is needed (e.g., prompt templates loaded from disk). During
 * build, the synthesis engine copies the file into the assembly `assets/`
 * directory and rewrites the reference.
 *
 * @example
 * ```ts
 * const prompt = new Prompt(stack, 'System', {
 *   content: new AssetRef('./prompts/system.md', 'prompt_file'),
 * });
 * ```
 */
export class AssetRef {
  /** Path to the source file (relative to project root). */
  public readonly filePath: string;

  /** Classification of the asset. */
  public readonly assetType: AssetType;

  constructor(filePath: string, assetType: AssetType) {
    this.filePath = filePath;
    this.assetType = assetType;
  }

  // ─── Serialization ──────────────────────────────────────────────────

  /**
   * Serialize to the assembly JSON format.
   *
   * @returns A plain object suitable for JSON serialization.
   */
  toJSON(): AssetRefJSON {
    return {
      [ASSET_REF_MARKER]: true,
      filePath: this.filePath,
      assetType: this.assetType,
    };
  }

  /** String representation for debugging. */
  toString(): string {
    return `AssetRef(${this.assetType}:${this.filePath})`;
  }
}

// ─── Serialization Type ─────────────────────────────────────────────────────

/**
 * The JSON shape of a serialized AssetRef.
 */
export interface AssetRefJSON {
  readonly __agentforge_asset_ref__: true;
  readonly filePath: string;
  readonly assetType: AssetType;
}

// ─── Type Guard ─────────────────────────────────────────────────────────────

/**
 * Type guard that checks whether a value is an {@link AssetRef} instance.
 */
export function isAssetRef(value: unknown): value is AssetRef {
  return value instanceof AssetRef;
}

/**
 * Type guard that checks whether a plain object is a serialized AssetRef.
 */
export function isAssetRefJSON(value: unknown): value is AssetRefJSON {
  return (
    typeof value === 'object' &&
    value !== null &&
    ASSET_REF_MARKER in value &&
    (value as Record<string, unknown>)[ASSET_REF_MARKER] === true
  );
}
