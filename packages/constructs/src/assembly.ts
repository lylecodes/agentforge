/**
 * @module assembly
 *
 * Agent Assembly — the Intermediate Representation (IR) schema for AgentForge.
 *
 * The Agent Assembly is a fully-resolved, target-agnostic JSON document that
 * describes an agent system. It is produced by the build phase and consumed
 * by target compilers. This module defines every interface that comprises
 * the `assembly.json` specification.
 *
 * @see Section 2.2 of the AgentForge roadmap for the full specification.
 */

// ─── Assembly Root ──────────────────────────────────────────────────────────

/**
 * The top-level structure of an Agent Assembly document (`assembly.json`).
 *
 * Contains all resources, connections, parameters, and protocol artifacts
 * for a single stack.
 */
export interface AgentAssembly {
  /** Schema version for backward compatibility. semver string. */
  readonly version: string;

  /** Assembly-level metadata. */
  readonly metadata: AssemblyMetadata;

  /** All resources keyed by construct-tree address. */
  readonly resources: Record<string, AgentResource>;

  /** Directed edges between resources (data flow, dependencies). */
  readonly connections: Connection[];

  /** Parameterized values that can be supplied at deploy time. */
  readonly parameters: Record<string, Parameter>;

  /** Generated protocol artifacts. */
  readonly protocols: ProtocolArtifacts;
}

/**
 * Metadata describing the assembly itself — provenance, integrity, and targeting.
 */
export interface AssemblyMetadata {
  /** Name of the stack that produced this assembly. */
  readonly stackName: string;

  /**
   * SHA-256 hash of the entire assembly (excluding this field).
   * Used for state comparison and drift detection.
   */
  readonly assemblyHash: string;

  /** ISO 8601 timestamp of synthesis. */
  readonly synthesizedAt: string;

  /** AgentForge CLI version that produced this assembly. */
  readonly agentforgeVersion: string;

  /** Target compiler(s) this assembly is intended for (informational). */
  readonly intendedTargets?: string[];
}

// ─── Resources ──────────────────────────────────────────────────────────────

/**
 * A single resource in the Agent Assembly.
 *
 * Resources are the nodes of the agent system graph. Each resource has a
 * fully-qualified type, resolved properties, dependency ordering, and
 * references to secrets and assets.
 *
 * @example
 * ```json
 * {
 *   "type": "agentforge::core::Agent",
 *   "id": "MyStack/MyAgent",
 *   "displayName": "MyAgent",
 *   "properties": { "name": "ResearchAssistant" },
 *   "dependencies": ["MyStack/Claude"],
 *   "metadata": {},
 *   "secretRefs": [],
 *   "assetRefs": []
 * }
 * ```
 */
export interface AgentResource {
  /**
   * Fully qualified resource type.
   *
   * Convention: `agentforge::<layer>::<Type>`
   *
   * Layers: `core`, `composition`, `governance`, `data`, `integration`, `infra`.
   *
   * @example "agentforge::core::Agent"
   * @example "agentforge::core::Model"
   * @example "agentforge::composition::Workflow"
   */
  readonly type: string;

  /**
   * Construct-tree unique address.
   * @example "MyStack/MyAgent"
   */
  readonly id: string;

  /** Human-readable display name. */
  readonly displayName: string;

  /**
   * Resolved property values (type-specific).
   * By the time the IR is produced, all tokens are resolved and all values
   * are concrete.
   */
  readonly properties: Record<string, unknown>;

  /** IDs of resources this resource depends on (build ordering). */
  readonly dependencies: string[];

  /**
   * Construct-level metadata.
   * Target hints, user annotations, and other extensible data.
   */
  readonly metadata: Record<string, unknown>;

  /** Secret references used by this resource (for validation and target resolution). */
  readonly secretRefs: SecretRefEntry[];

  /** Asset references used by this resource. */
  readonly assetRefs: AssetRefEntry[];
}

// ─── Connections ────────────────────────────────────────────────────────────

/**
 * A directed edge between two resources in the agent system graph.
 */
export interface Connection {
  /** Unique connection ID. */
  readonly id: string;

  /** Source resource ID. */
  readonly source: string;

  /** Target resource ID. */
  readonly target: string;

  /** Connection type describing the relationship. */
  readonly type: ConnectionType;

  /** Data mapping between source output and target input. */
  readonly dataMapping?: Record<string, string>;

  /** Condition for conditional connections (e.g., Router routes). */
  readonly condition?: string;

  /** Ordering weight for sequential connections. */
  readonly order?: number;
}

/**
 * The type of relationship between two resources.
 */
export type ConnectionType =
  | 'tool_binding'      // Agent -> Tool
  | 'model_binding'     // Agent -> Model
  | 'prompt_binding'    // Agent -> Prompt
  | 'memory_binding'    // Agent -> Memory
  | 'mcp_binding'       // Agent -> MCPServer
  | 'kb_binding'        // Agent -> KnowledgeBase
  | 'schema_binding'    // Agent -> Schema (input/output)
  | 'guardrail_binding' // Agent -> Guardrail
  | 'policy_binding'    // Agent -> Policy
  | 'workflow_step'     // Workflow -> Agent (ordered)
  | 'team_membership'   // Team -> Agent
  | 'router_route'      // Router -> Agent (conditional)
  | 'handoff'           // Agent -> Agent (transfer)
  | 'data_flow'         // Generic data connection
  | 'webhook_binding'   // Agent -> Webhook
  | 'channel_binding'   // Agent -> Channel
  | 'vector_store'      // KnowledgeBase -> VectorStore
  | 'monitor_target'    // Monitor -> Agent
  | 'eval_target';      // Evaluation -> Agent

// ─── Parameters ─────────────────────────────────────────────────────────────

/**
 * A parameterized value that can be supplied at deploy time.
 */
export interface Parameter {
  /** Parameter name. */
  readonly name: string;

  /** JSON Schema type. */
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';

  /** Human-readable description. */
  readonly description: string;

  /** Default value (if not required). */
  readonly default?: unknown;

  /** Is this parameter required at deploy time? */
  readonly required: boolean;

  /** Allowed values (enum constraint). */
  readonly allowedValues?: unknown[];
}

// ─── Secret References ──────────────────────────────────────────────────────

/**
 * Describes a secret used by a resource, including how to resolve it at
 * deploy time. The assembly **never** contains the secret value itself.
 */
export interface SecretRefEntry {
  /** Name/key of the secret. */
  readonly name: string;

  /** How the secret is resolved at deploy time. */
  readonly source: SecretSource;

  /** Property path where this secret is used (for error reporting). */
  readonly propertyPath: string;
}

/**
 * Discriminated union of secret resolution strategies.
 */
export type SecretSource =
  | { readonly type: 'env'; readonly variableName: string }
  | { readonly type: 'file'; readonly filePath: string; readonly encoding?: 'utf-8' | 'base64' }
  | { readonly type: 'vault'; readonly provider: string; readonly path: string; readonly key?: string }
  | { readonly type: 'aws_secrets_manager'; readonly secretId: string; readonly versionStage?: string }
  | { readonly type: 'k8s_secret'; readonly name: string; readonly namespace?: string; readonly key: string }
  | { readonly type: 'azure_key_vault'; readonly vaultUrl: string; readonly secretName: string };

// ─── Asset References ───────────────────────────────────────────────────────

/**
 * Describes a file asset bundled into the assembly.
 */
export interface AssetRefEntry {
  /** Unique asset ID (content-hash based). */
  readonly assetId: string;

  /** Original source path (relative to project root). */
  readonly sourcePath: string;

  /** Path within the assembly `assets/` directory. */
  readonly assemblyPath: string;

  /** SHA-256 hash of the asset content. */
  readonly contentHash: string;

  /** Asset type classification. */
  readonly assetType: AssetType;

  /** File size in bytes. */
  readonly sizeBytes: number;
}

/**
 * Classification of bundled assets.
 */
export type AssetType =
  | 'prompt_file'              // .md, .txt prompt templates
  | 'tool_handler'             // .ts, .js tool implementation files
  | 'tool_handler_extracted'   // Inline function extracted by AST analysis
  | 'schema_file'              // .json schema definitions
  | 'data_file'                // CSV, JSONL, etc.
  | 'binary'                   // Images, compiled artifacts
  | 'config';                  // Configuration files

// ─── Protocol Artifacts ─────────────────────────────────────────────────────

/**
 * References to generated protocol artifacts within the assembly.
 */
export interface ProtocolArtifacts {
  /** Generated AGENTS.md file reference. */
  readonly agentsMd?: ProtocolArtifactRef;

  /** Generated A2A Agent Card JSON reference. */
  readonly a2aAgentCard?: ProtocolArtifactRef;

  /** Generated Agent Skills manifest reference. */
  readonly agentSkills?: ProtocolArtifactRef;
}

/**
 * A reference to a single generated protocol artifact.
 */
export interface ProtocolArtifactRef {
  /** Relative path to the generated artifact within the assembly. */
  readonly path: string;

  /** SHA-256 hash of the content. */
  readonly contentHash: string;
}

// ─── Assembly Version ───────────────────────────────────────────────────────

/** Current version of the Agent Assembly schema. */
export const ASSEMBLY_VERSION = '0.1.0';
