/**
 * @module compiler
 *
 * DockerTargetCompiler — compiles an Agent Assembly into a Docker-deployable
 * project with Dockerfile, docker-compose.yml, and a Node.js HTTP runtime
 * using the Vercel AI SDK.
 *
 * This target compiler generates the same agent modules as the local target
 * but wraps them in an HTTP server and Docker deployment configuration
 * instead of a readline-based CLI.
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import type {
  AgentAssembly,
  AgentResource,
  ITargetCompiler,
  TargetValidationResult,
  CompileResult,
  Artifact,
} from './types.js';

import {
  generateDockerfile,
  generateDockerCompose,
  generateEnvExample,
  generateAgentModule,
  generateDockerRuntime,
  generatePackageJson,
} from './codegen.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Resource types that the Docker target can compile. */
const SUPPORTED_RESOURCE_TYPES = [
  'agentforge::core::Agent',
  'agentforge::core::Model',
  'agentforge::core::Tool',
  'agentforge::core::Prompt',
  'agentforge::core::MCPServer',
  'agentforge::core::Memory',
  'agentforge::core::Schema',
  'agentforge::composition::Workflow',
  'agentforge::composition::Team',
  'agentforge::composition::Router',
  'agentforge::composition::Handoff',
] as const;

const SUPPORTED_SET = new Set<string>(SUPPORTED_RESOURCE_TYPES);

// ─── DockerTargetCompiler ───────────────────────────────────────────────────

/**
 * Compiles an Agent Assembly into a Docker-deployable project.
 *
 * The compiled output includes:
 * - `Dockerfile` — multi-stage Node.js 22 Alpine build
 * - `docker-compose.yml` — services for agents and MCP sidecars
 * - `.env.example` — template for required environment variables
 * - `package.json` — project manifest with dependencies
 * - `agents/<name>.ts` — per-agent runtime modules (Vercel AI SDK)
 * - `runtime.ts` — HTTP server entrypoint
 *
 * @example
 * ```ts
 * const compiler = new DockerTargetCompiler();
 * const validation = compiler.validate(assembly);
 * if (validation.valid) {
 *   const result = compiler.compile(assembly, './agentforge.out/docker');
 * }
 * ```
 */
export class DockerTargetCompiler implements ITargetCompiler {
  /** @inheritdoc */
  readonly name = 'docker' as const;

  /** @inheritdoc */
  readonly version = '0.1.0' as const;

  // ─── Validate ──────────────────────────────────────────────────────

  /**
   * Validate that the assembly is compatible with the Docker target.
   *
   * The Docker target requires at least one Agent resource. It warns
   * about any resource types it does not support (they will be skipped
   * during compilation).
   *
   * @param assembly - The Agent Assembly to validate.
   * @returns Validation result.
   */
  validate(assembly: AgentAssembly): TargetValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Must have at least one Agent resource.
    const agents = Object.values(assembly.resources).filter(
      r => r.type === 'agentforge::core::Agent',
    );

    if (agents.length === 0) {
      errors.push(
        'Assembly must contain at least one Agent resource (agentforge::core::Agent). ' +
        'Define an Agent construct in your stack.',
      );
    }

    // Warn about unsupported resource types.
    const unsupportedTypes = new Set<string>();
    for (const resource of Object.values(assembly.resources)) {
      if (!SUPPORTED_SET.has(resource.type)) {
        unsupportedTypes.add(resource.type);
      }
    }

    for (const type of unsupportedTypes) {
      warnings.push(
        `Resource type '${type}' is not supported by the docker target and will be skipped.`,
      );
    }

    // Warn if agents lack model bindings.
    for (const agent of agents) {
      const hasModelBinding = assembly.connections.some(
        c => c.type === 'model_binding' && c.target === agent.id,
      );
      if (!hasModelBinding) {
        warnings.push(
          `Agent '${agent.displayName}' (${agent.id}) has no model binding. ` +
          'A default model (anthropic/claude-sonnet-4) will be used.',
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ─── Compile ───────────────────────────────────────────────────────

  /**
   * Compile the assembly into a Docker-deployable project.
   *
   * Generates the following structure in `outDir`:
   * - `Dockerfile` — multi-stage build
   * - `docker-compose.yml` — service definitions
   * - `.env.example` — environment variable template
   * - `package.json` — project manifest
   * - `tsconfig.json` — TypeScript configuration
   * - `agents/<name>.ts` — per-agent runtime modules
   * - `tools/` — copied tool handler assets
   * - `runtime.ts` — HTTP server entrypoint
   *
   * @param assembly - The Agent Assembly to compile.
   * @param outDir   - Absolute path to the output directory.
   * @returns Compile result with list of produced artifacts.
   */
  compile(assembly: AgentAssembly, outDir: string): CompileResult {
    const artifacts: Artifact[] = [];
    const warnings: string[] = [];
    const unsupportedResources: string[] = [];

    // Ensure output directories exist.
    mkdirSync(join(outDir, 'agents'), { recursive: true });
    mkdirSync(join(outDir, 'tools'), { recursive: true });

    // Track unsupported resource types.
    for (const resource of Object.values(assembly.resources)) {
      if (!SUPPORTED_SET.has(resource.type) && !unsupportedResources.includes(resource.type)) {
        unsupportedResources.push(resource.type);
      }
    }

    // ── Generate Dockerfile ─────────────────────────────────────────
    const dockerfile = generateDockerfile();
    writeFileSync(join(outDir, 'Dockerfile'), dockerfile, 'utf-8');
    artifacts.push({
      path: 'Dockerfile',
      type: 'config',
      description: 'Multi-stage Docker build for Node.js 22 Alpine',
    });

    // ── Generate docker-compose.yml ─────────────────────────────────
    const compose = generateDockerCompose(assembly);
    writeFileSync(join(outDir, 'docker-compose.yml'), compose, 'utf-8');
    artifacts.push({
      path: 'docker-compose.yml',
      type: 'config',
      description: 'Docker Compose service definitions for agents and MCP sidecars',
    });

    // ── Generate .env.example ───────────────────────────────────────
    const envExample = generateEnvExample(assembly);
    writeFileSync(join(outDir, '.env.example'), envExample, 'utf-8');
    artifacts.push({
      path: '.env.example',
      type: 'config',
      description: 'Template for required environment variables',
    });

    // ── Generate package.json ───────────────────────────────────────
    const packageJson = generatePackageJson(assembly);
    writeFileSync(join(outDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
    artifacts.push({
      path: 'package.json',
      type: 'package',
      description: 'Runtime project manifest with Docker build scripts',
    });

    // ── Generate tsconfig.json ──────────────────────────────────────
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2022'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        outDir: 'dist',
        rootDir: '.',
        declaration: false,
        sourceMap: false,
        isolatedModules: true,
        verbatimModuleSyntax: true,
      },
      include: ['runtime.ts', 'agents/**/*.ts'],
    };
    writeFileSync(join(outDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');
    artifacts.push({
      path: 'tsconfig.json',
      type: 'config',
      description: 'TypeScript configuration for Docker build',
    });

    // ── Generate agent modules ──────────────────────────────────────
    const agentResources = Object.values(assembly.resources).filter(
      r => r.type === 'agentforge::core::Agent',
    );

    const agentNames: string[] = [];

    for (const agentRes of agentResources) {
      const modelRes = this.findBoundResource(agentRes.id, 'model_binding', assembly);
      const toolResources = this.findBoundResources(agentRes.id, 'tool_binding', assembly);
      const promptRes = this.findBoundResource(agentRes.id, 'prompt_binding', assembly);
      const mcpResources = this.findBoundResources(agentRes.id, 'mcp_binding', assembly);

      const moduleCode = generateAgentModule(
        agentRes,
        modelRes,
        toolResources,
        promptRes,
        mcpResources,
        assembly,
      );

      const agentFileName = agentRes.displayName;
      const agentFilePath = join(outDir, 'agents', `${agentFileName}.ts`);
      writeFileSync(agentFilePath, moduleCode, 'utf-8');
      agentNames.push(agentFileName);

      artifacts.push({
        path: `agents/${agentFileName}.ts`,
        type: 'source',
        description: `Agent runtime module for '${agentRes.displayName}'`,
      });
    }

    // ── Copy tool handler assets ────────────────────────────────────
    for (const resource of Object.values(assembly.resources)) {
      if (resource.type !== 'agentforge::core::Tool') continue;

      for (const assetRef of resource.assetRefs) {
        const destFileName = assetRef.assemblyPath.split('/').pop() ?? assetRef.assetId;
        const destPath = join(outDir, 'tools', destFileName);

        const assemblyDir = dirname(outDir);
        const assetSourcePath = join(assemblyDir, assetRef.assemblyPath);

        if (existsSync(assetSourcePath)) {
          mkdirSync(dirname(destPath), { recursive: true });
          copyFileSync(assetSourcePath, destPath);
        } else {
          writeFileSync(
            destPath,
            `// Asset not found at assembly time: ${assetRef.assemblyPath}\n` +
            `// Source: ${assetRef.sourcePath}\n` +
            `export default function() { throw new Error('Asset not bundled: ${assetRef.sourcePath}'); }\n`,
            'utf-8',
          );
          warnings.push(
            `Tool asset '${assetRef.sourcePath}' (${assetRef.assemblyPath}) was not found. ` +
            'A stub handler was generated.',
          );
        }

        artifacts.push({
          path: `tools/${destFileName}`,
          type: 'source',
          description: `Tool handler asset for '${resource.displayName}'`,
        });
      }
    }

    // ── Generate runtime entrypoint ─────────────────────────────────
    const runtimeCode = generateDockerRuntime(agentNames);
    writeFileSync(join(outDir, 'runtime.ts'), runtimeCode, 'utf-8');
    artifacts.push({
      path: 'runtime.ts',
      type: 'source',
      description: 'Main entrypoint — HTTP server exposing agents as REST endpoints',
    });

    return {
      artifacts,
      warnings,
      unsupportedResources,
    };
  }

  // ─── Supported Resource Types ─────────────────────────────────────

  /**
   * List the resource types supported by the Docker target.
   *
   * @returns Array of fully-qualified resource type strings.
   */
  supportedResourceTypes(): string[] {
    return [...SUPPORTED_RESOURCE_TYPES];
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  /**
   * Find a single resource bound to an agent via a specific connection type.
   */
  private findBoundResource(
    agentId: string,
    connectionType: string,
    assembly: AgentAssembly,
  ): AgentResource | undefined {
    const conn = assembly.connections.find(
      c => c.type === connectionType && c.target === agentId,
    );
    if (!conn) return undefined;
    return assembly.resources[conn.source];
  }

  /**
   * Find all resources bound to an agent via a specific connection type.
   */
  private findBoundResources(
    agentId: string,
    connectionType: string,
    assembly: AgentAssembly,
  ): AgentResource[] {
    return assembly.connections
      .filter(c => c.type === connectionType && c.target === agentId)
      .map(c => assembly.resources[c.source])
      .filter((r): r is AgentResource => r !== undefined);
  }
}
