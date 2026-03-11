/**
 * @agentforge/state — State management for AgentForge.
 *
 * This package handles state file I/O, diffing, and hashing with zero
 * external dependencies.
 *
 * @packageDocumentation
 */

// Types
export type {
  StateFile,
  StateResource,
  StateMetadata,
  DiffResult,
  ResourceDiff,
} from './types.js';

// State file management
export { StateManager } from './state-file.js';

// Diffing
export { computeDiff } from './diff.js';
export type { AssemblyResource } from './diff.js';

// Hashing utilities
export { hashResource, hashAssembly } from './hash.js';
