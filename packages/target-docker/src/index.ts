/**
 * @module @agentforge/target-docker
 *
 * Docker target compiler for AgentForge.
 *
 * Compiles an Agent Assembly into a Docker-deployable project with
 * Dockerfile, docker-compose.yml, and a Node.js HTTP runtime using
 * the Vercel AI SDK. Each agent is exposed as an HTTP endpoint.
 *
 * @example
 * ```ts
 * import { DockerTargetCompiler } from '@agentforge/target-docker';
 *
 * const compiler = new DockerTargetCompiler();
 * const result = compiler.compile(assembly, './agentforge.out/docker');
 * ```
 */

export { DockerTargetCompiler } from './compiler.js';

export type {
  // Target compiler contract
  ITargetCompiler,
  TargetValidationResult,
  CompileResult,
  Artifact,
  DeployOptions,
  DeployResult,

  // Docker-specific types
  DockerComposeService,
  DockerComposeConfig,

  // Re-exported assembly types
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
} from './types.js';

export {
  generateDockerfile,
  generateDockerCompose,
  generateEnvExample,
  generateAgentModule,
  generateDockerRuntime,
  generatePackageJson,
} from './codegen.js';
