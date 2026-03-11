/**
 * @agentforge/state — State diffing engine.
 *
 * Compares an assembly's resource set against a persisted state file to
 * determine which resources need to be added, changed, or removed during
 * the next deployment.
 */

import type { DiffResult, ResourceDiff, StateFile } from './types.js';

// ---------------------------------------------------------------------------
// Assembly resource descriptor (passed in by the caller)
// ---------------------------------------------------------------------------

/** Minimal resource descriptor extracted from an assembly for diffing. */
export interface AssemblyResource {
  /** Fully-qualified AgentForge resource type. */
  type: string;

  /** SHA-256 hash of the resource's assembly representation. */
  hash: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the diff between an assembly's resource map and a state file.
 *
 * The diff is purely hash-based — if the hash of a resource in the assembly
 * matches the `lastAssemblyHash` in the state record the resource is
 * considered unchanged.
 *
 * @param assemblyResources - Map of resource IDs to their type and hash from
 *   the current assembly output.
 * @param state - The persisted state file to compare against. If the state
 *   contains no resources, every assembly resource is treated as an addition.
 * @returns A {@link DiffResult} describing what changed.
 */
export function computeDiff(
  assemblyResources: Record<string, AssemblyResource>,
  state: StateFile,
): DiffResult {
  const added: ResourceDiff[] = [];
  const changed: ResourceDiff[] = [];
  const removed: ResourceDiff[] = [];
  const unchanged: string[] = [];

  const stateResources = state.resources;

  // Walk the assembly to find additions and changes.
  for (const [id, assembly] of Object.entries(assemblyResources)) {
    const existing = stateResources[id];

    if (!existing) {
      // Resource exists in assembly but not in state — it's new.
      added.push({
        id,
        type: assembly.type,
        action: 'add',
        newHash: assembly.hash,
      });
      continue;
    }

    if (existing.lastAssemblyHash !== assembly.hash) {
      // Resource exists in both but the hash changed — it needs updating.
      changed.push({
        id,
        type: assembly.type,
        action: 'change',
        oldHash: existing.lastAssemblyHash,
        newHash: assembly.hash,
      });
    } else {
      // Hashes match — nothing to do.
      unchanged.push(id);
    }
  }

  // Walk the state to find removals (resources no longer in the assembly).
  for (const [id, resource] of Object.entries(stateResources)) {
    if (!(id in assemblyResources)) {
      removed.push({
        id,
        type: resource.type,
        action: 'remove',
        oldHash: resource.lastAssemblyHash,
      });
    }
  }

  return { added, changed, removed, unchanged };
}
