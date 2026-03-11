/**
 * @agentforge/state — Type definitions for state file management.
 *
 * These types describe the on-disk state format used by AgentForge to track
 * deployed resources and detect drift between assembly output and live state.
 */

// ---------------------------------------------------------------------------
// State file root
// ---------------------------------------------------------------------------

/**
 * Top-level structure persisted to `.agentforge/state-{target}.json`.
 *
 * The state file is the single source of truth for what has been deployed to a
 * given target. It is created on the first `agentforge deploy` and updated on
 * every subsequent deploy or destroy operation.
 */
export interface StateFile {
  /** Schema version — always `1` for the current format. */
  version: number;

  /** Deployment target identifier (e.g. `'local'`, `'docker'`). */
  target: string;

  /**
   * Map of deployed resources keyed by their construct-tree address
   * (e.g. `'DemoStack/Researcher'`).
   */
  resources: Record<string, StateResource>;

  /** Build-level metadata for the most recent deployment. */
  metadata: StateMetadata;
}

// ---------------------------------------------------------------------------
// Individual resource record
// ---------------------------------------------------------------------------

/** Represents a single tracked resource within the state file. */
export interface StateResource {
  /**
   * Fully-qualified AgentForge resource type
   * (e.g. `'agentforge::core::Agent'`).
   */
  type: string;

  /**
   * Construct-tree unique address that identifies this resource
   * (e.g. `'DemoStack/Researcher'`).
   */
  id: string;

  /** Current lifecycle status of the resource. */
  status: 'deployed' | 'failed' | 'destroying';

  /** ISO 8601 timestamp of the last successful deployment. */
  lastDeployedAt: string;

  /** SHA-256 hash of the resource's assembly JSON at deploy time. */
  lastAssemblyHash: string;

  /**
   * Target-specific output values produced during deployment
   * (e.g. `{ endpoint: 'http://localhost:3000/agents/researcher' }`).
   */
  outputs: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Build metadata
// ---------------------------------------------------------------------------

/** Metadata about the most recent build that produced this state. */
export interface StateMetadata {
  /** ISO 8601 timestamp of the build that produced the assembly. */
  lastBuildAt: string;

  /** SHA-256 hash of the full assembly output. */
  assemblyHash: string;
}

// ---------------------------------------------------------------------------
// Diff types
// ---------------------------------------------------------------------------

/** The result of comparing an assembly against a state file. */
export interface DiffResult {
  /** Resources present in the assembly but absent from state. */
  added: ResourceDiff[];

  /** Resources present in both but with differing assembly hashes. */
  changed: ResourceDiff[];

  /** Resources present in state but absent from the assembly. */
  removed: ResourceDiff[];

  /** Resource IDs present in both with identical assembly hashes. */
  unchanged: string[];
}

/** A single resource-level diff entry. */
export interface ResourceDiff {
  /** Construct-tree unique address of the resource. */
  id: string;

  /** Fully-qualified AgentForge resource type. */
  type: string;

  /** The planned action for this resource. */
  action: 'add' | 'change' | 'remove';

  /** Hash from the existing state (present for `change` and `remove`). */
  oldHash?: string;

  /** Hash from the new assembly (present for `add` and `change`). */
  newHash?: string;
}
