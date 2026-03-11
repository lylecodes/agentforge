/**
 * @module @agentforge/constructs
 *
 * The foundation package of the AgentForge framework.
 *
 * This package provides:
 * - **Assembly types** — The Agent Assembly IR schema
 * - **App** — Root construct that drives synthesis
 * - **Stack** — Deployment unit grouping resources
 * - **AgentResourceBase** — Base class for all resource constructs
 * - **SecretRef** — Secret references (never contain secret values)
 * - **Token** — Lazy/cross-reference value resolution
 * - **AssetManager** — File asset management with content-hashing
 * - **Validation** — Property validation and secret leak detection
 * - **Errors** — Structured error code system
 * - **Aspects** — Visitor pattern for cross-cutting concerns
 * - **Protocols** — Protocol artifact generators (AGENTS.md, A2A, Skills)
 *
 * @packageDocumentation
 */

// ─── Re-export from constructs ──────────────────────────────────────────────

export { Construct } from 'constructs';
export type { IConstruct } from 'constructs';

// ─── Assembly Types ─────────────────────────────────────────────────────────

export {
  ASSEMBLY_VERSION,
} from './assembly.js';

export type {
  AgentAssembly,
  AssemblyMetadata,
  AgentResource,
  Connection,
  ConnectionType,
  Parameter,
  SecretRefEntry,
  SecretSource,
  AssetRefEntry,
  AssetType,
  ProtocolArtifacts,
  ProtocolArtifactRef,
} from './assembly.js';

// ─── App ────────────────────────────────────────────────────────────────────

export { App } from './app.js';
export type { AppProps, BuildResult } from './app.js';

// ─── Stack ──────────────────────────────────────────────────────────────────

export { Stack } from './stack.js';
export type { StackProps } from './stack.js';

// ─── Resource ───────────────────────────────────────────────────────────────

export { AgentResourceBase } from './resource.js';

// ─── Errors ─────────────────────────────────────────────────────────────────

export {
  AgentForgeError,
  formatDiagnostic,
  docsUrl,
  missingPropertyDiagnostic,
  invalidTypeDiagnostic,
  possibleSecretDiagnostic,
  circularTokenDiagnostic,
  unresolvedTokenDiagnostic,
  assetNotFoundDiagnostic,
  unsupportedResourceDiagnostic,
} from './errors.js';

export type {
  Severity,
  AgentForgeDiagnostic,
} from './errors.js';

// ─── Secrets ────────────────────────────────────────────────────────────────

export {
  SecretRef,
  isSecretRef,
  isSecretRefJSON,
} from './secrets.js';

export type { SecretRefJSON } from './secrets.js';

// ─── Tokens ─────────────────────────────────────────────────────────────────

export {
  Token,
  TokenMap,
  resolveTokens,
  resolveValue,
  isToken,
  isResolvable,
  containsTokens,
  resetTokenCounter,
  TOKEN_REGEX,
} from './tokens.js';

export type { IResolvable } from './tokens.js';

// ─── Asset References ───────────────────────────────────────────────────────

export { AssetRef, isAssetRef, isAssetRefJSON } from './asset-ref.js';
export type { AssetRefJSON } from './asset-ref.js';

// ─── Assets ─────────────────────────────────────────────────────────────────

export { AssetManager } from './assets.js';

// ─── Validation ─────────────────────────────────────────────────────────────

export {
  validate,
  validateSecrets,
  mergeValidationResults,
  toValidationResult,
} from './validation.js';

export type {
  ValidationResult,
  IValidatable,
  PropertyDescriptor,
} from './validation.js';

// ─── Aspects ────────────────────────────────────────────────────────────────

export {
  Aspects,
  applyAspect,
  applyAspects,
  ResourceAspect,
} from './aspects.js';

export type { IAspect } from './aspects.js';

// ─── Target Compiler ────────────────────────────────────────────────────────

export type {
  ITargetCompiler,
  TargetValidationResult,
  CompileResult,
  Artifact,
  DeployOptions,
  DeployResult,
} from './target.js';

// ─── Protocols ──────────────────────────────────────────────────────────────

export {
  generateAgentsMd,
  generateA2AAgentCard,
  generateAgentSkillsManifest,
} from './protocols.js';

export type {
  A2AAgentCard,
  AgentSkillsManifest,
} from './protocols.js';
