/**
 * @module types
 *
 * Docker-specific type definitions for the DockerTarget compiler.
 *
 * Re-exports core assembly types from `@agentforge/constructs` and the
 * shared target compiler contract. Also defines Docker-specific
 * configuration types for docker-compose generation.
 */

// ─── Re-exported Assembly Types ─────────────────────────────────────────────

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

export type {
  ITargetCompiler,
  TargetValidationResult,
  CompileResult,
  Artifact,
  DeployOptions,
  DeployResult,
} from '@agentforge/constructs';

// ─── Docker-specific Types ──────────────────────────────────────────────────

/**
 * Describes a single service in a docker-compose.yml file.
 */
export interface DockerComposeService {
  /** Docker image or build context. */
  readonly build?: { context: string; dockerfile: string };

  /** Container name. */
  readonly container_name?: string;

  /** Port mappings (host:container). */
  readonly ports?: string[];

  /** Environment variables. */
  readonly environment?: Record<string, string>;

  /** Volume mounts. */
  readonly volumes?: string[];

  /** Depends on other services. */
  readonly depends_on?: string[];

  /** Restart policy. */
  readonly restart?: string;

  /** Command override. */
  readonly command?: string | string[];

  /** Health check configuration. */
  readonly healthcheck?: {
    test: string | string[];
    interval: string;
    timeout: string;
    retries: number;
    start_period?: string;
  };
}

/**
 * Top-level docker-compose configuration structure.
 */
export interface DockerComposeConfig {
  /** Compose file version. */
  readonly version?: string;

  /** Services keyed by service name. */
  readonly services: Record<string, DockerComposeService>;
}
