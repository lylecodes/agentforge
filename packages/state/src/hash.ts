/**
 * @agentforge/state — Deterministic hashing utilities.
 *
 * All hashes are computed over a canonical JSON representation (sorted keys)
 * using SHA-256, prefixed with `sha256:` for clarity in state files.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively sorts all object keys so the resulting JSON is deterministic
 * regardless of insertion order.
 */
function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}

/**
 * Produces the `sha256:<hex>` digest of a canonical JSON string.
 */
function sha256(data: string): string {
  const digest = createHash('sha256').update(data, 'utf8').digest('hex');
  return `sha256:${digest}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic SHA-256 hash of a single resource object.
 *
 * The resource is serialised with sorted keys so that logically identical
 * objects always produce the same hash regardless of property order.
 *
 * @param resource - An arbitrary resource object to hash.
 * @returns A `sha256:<hex>` digest string.
 */
export function hashResource(resource: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeys(resource));
  return sha256(canonical);
}

/**
 * Compute a deterministic SHA-256 hash of a full assembly object.
 *
 * Follows the same canonical-JSON approach as {@link hashResource}.
 *
 * @param assembly - The full assembly output object.
 * @returns A `sha256:<hex>` digest string.
 */
export function hashAssembly(assembly: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeys(assembly));
  return sha256(canonical);
}
