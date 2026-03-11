/**
 * @module @agentforge/target-local
 *
 * Local target compiler for AgentForge.
 *
 * Compiles an Agent Assembly into a runnable Node.js project that uses
 * the Vercel AI SDK for model invocation, tool calling, and MCP server
 * integration. The generated project is a standalone TypeScript application
 * executed via `npx tsx runtime.ts`.
 *
 * @example
 * ```ts
 * import { LocalTargetCompiler } from '@agentforge/target-local';
 *
 * const compiler = new LocalTargetCompiler();
 * const result = compiler.compile(assembly, './agentforge.out/local');
 * await compiler.deploy(result, { projectDir: './agentforge.out/local' });
 * ```
 *
 * @see Section 1.7 of the AgentForge roadmap.
 */

export { LocalTargetCompiler } from './compiler.js';

export type {
  // Target compiler contract
  ITargetCompiler,
  ValidationResult,
  CompileResult,
  Artifact,
  DeployOptions,
  DeployResult,

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
  generateAgentModule,
  generateRuntime,
  generatePackageJson,
  generateConfigJson,
  generateMCPSetup,
} from './codegen.js';
