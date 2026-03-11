/**
 * @module target
 *
 * Target compiler contract and supporting types.
 *
 * These interfaces define the contract that every target compiler must
 * implement. A target compiler translates a target-agnostic Agent Assembly
 * into runnable artifacts for a specific runtime environment (local Node.js,
 * Docker, Kubernetes, etc.).
 *
 * Extracted from `@agentforge/target-local` so that all target packages can
 * depend on `@agentforge/constructs` (not on each other).
 *
 * @see Section 2.4 of the AgentForge roadmap.
 */

import type { AgentAssembly } from './assembly.js';

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Result of validating an Agent Assembly against a target compiler.
 *
 * Note: This is distinct from the construct-level `ValidationResult` in
 * `./validation.js`, which uses structured `AgentForgeDiagnostic` entries.
 * This type uses plain strings and is specific to the target compilation
 * pipeline.
 */
export interface TargetValidationResult {
  /** Whether the assembly is valid for this target. */
  readonly valid: boolean;

  /** Blocking errors that prevent compilation. */
  readonly errors: string[];

  /** Non-blocking warnings (e.g., unsupported resource types that will be skipped). */
  readonly warnings: string[];
}

// ─── Compilation ────────────────────────────────────────────────────────────

/**
 * A single artifact produced by the compiler (a generated file).
 */
export interface Artifact {
  /** Relative path within the output directory. */
  readonly path: string;

  /** Classification of the artifact. */
  readonly type: 'source' | 'config' | 'package';

  /** Human-readable description of this artifact. */
  readonly description: string;
}

/**
 * Result of compiling an Agent Assembly into target-specific artifacts.
 */
export interface CompileResult {
  /** Files produced by the compiler. */
  readonly artifacts: Artifact[];

  /** Non-blocking warnings encountered during compilation. */
  readonly warnings: string[];

  /** Resource types present in the assembly that this target cannot handle. */
  readonly unsupportedResources: string[];
}

// ─── Deployment ─────────────────────────────────────────────────────────────

/**
 * Options for deploying compiled artifacts.
 */
export interface DeployOptions {
  /** Root directory of the compiled project. */
  readonly projectDir: string;

  /** Whether to watch for file changes and restart automatically. */
  readonly watch?: boolean;
}

/**
 * Result of a deployment operation.
 */
export interface DeployResult {
  /** Whether the deployment succeeded. */
  readonly success: boolean;

  /** Per-resource deployment status and outputs. */
  readonly resources: Record<string, {
    status: string;
    outputs: Record<string, string>;
  }>;

  /** Child process handle (for local target — used to stop the process). */
  readonly process?: unknown;
}

// ─── Target Compiler Interface ──────────────────────────────────────────────

/**
 * The contract that every target compiler must implement.
 *
 * A target compiler translates a target-agnostic Agent Assembly into
 * runnable artifacts for a specific runtime environment (local Node.js,
 * Docker, Kubernetes, etc.).
 *
 * @see Section 2.4 of the AgentForge roadmap.
 */
export interface ITargetCompiler {
  /** Short identifier for this target (e.g., "local", "docker"). */
  readonly name: string;

  /** Semver version of this target compiler. */
  readonly version: string;

  /**
   * Validate that an assembly is compatible with this target.
   *
   * @param assembly - The Agent Assembly to validate.
   * @returns Validation result with errors and warnings.
   */
  validate(assembly: AgentAssembly): TargetValidationResult;

  /**
   * Compile the assembly into target-specific artifacts.
   *
   * @param assembly - The Agent Assembly to compile.
   * @param outDir   - Absolute path to the output directory.
   * @returns Compile result with list of produced artifacts.
   */
  compile(assembly: AgentAssembly, outDir: string): CompileResult;

  /**
   * Deploy the compiled artifacts (optional).
   *
   * @param artifacts - The compile result to deploy.
   * @param options   - Deployment options.
   * @returns A promise resolving to the deployment result.
   */
  deploy?(artifacts: CompileResult, options: DeployOptions): Promise<DeployResult>;

  /**
   * Tear down a previous deployment (optional).
   *
   * @param deployResult - The result from a previous deploy() call.
   */
  destroy?(deployResult: DeployResult): Promise<void>;

  /**
   * List the resource types this target supports.
   *
   * @returns Array of fully-qualified resource type strings.
   */
  supportedResourceTypes(): string[];
}
