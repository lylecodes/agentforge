/**
 * @module types
 *
 * Type definitions for the LocalTarget compiler.
 *
 * Re-exports core assembly types from `@agentforge/constructs` and the
 * shared target compiler contract (ITargetCompiler and supporting interfaces).
 *
 * The target compiler types were extracted to `@agentforge/constructs` so
 * that all target packages can depend on constructs (not on each other).
 *
 * @see Section 2.4 of the AgentForge roadmap.
 */

// ─── Re-exported Assembly Types ─────────────────────────────────────────────

// These are re-exported from @agentforge/constructs so that consumers of
// target-local do not need a direct dependency on constructs.
export type {
  AgentAssembly,
  AgentResource,
  AssemblyMetadata,
  Connection,
  ConnectionType,
  Parameter,
  SecretRefEntry,
  SecretSource,
  AssetRefEntry,
  AssetType,
  ProtocolArtifacts,
  ProtocolArtifactRef,
} from '@agentforge/constructs';

// ─── Re-exported Target Compiler Types ──────────────────────────────────────

// The shared target compiler contract now lives in @agentforge/constructs.
// Re-export with the original names for backward compatibility.
// Note: TargetValidationResult is re-exported as ValidationResult to
// maintain the existing public API of this package.
export type {
  ITargetCompiler,
  TargetValidationResult as ValidationResult,
  CompileResult,
  Artifact,
  DeployOptions,
  DeployResult,
} from '@agentforge/constructs';
