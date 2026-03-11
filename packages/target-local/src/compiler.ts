/**
 * @module compiler
 *
 * LocalTargetCompiler — compiles an Agent Assembly into a runnable
 * Node.js project using Vercel AI SDK as the runtime layer.
 *
 * This is the first target compiler for AgentForge. It produces a
 * self-contained TypeScript project that can be executed locally
 * via `npx tsx runtime.ts`.
 *
 * @see Section 1.7 of the AgentForge roadmap.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import type {
  AgentAssembly,
  AgentResource,
  ITargetCompiler,
  ValidationResult,
  CompileResult,
  Artifact,
  DeployOptions,
  DeployResult,
} from './types.js';

import {
  generateAgentModule,
  generateRuntime,
  generatePackageJson,
  generateConfigJson,
} from './codegen.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Resource types that the local target can compile. */
const SUPPORTED_RESOURCE_TYPES = [
  'agentforge::core::Agent',
  'agentforge::core::Model',
  'agentforge::core::Tool',
  'agentforge::core::Prompt',
  'agentforge::core::MCPServer',
  'agentforge::composition::Workflow',
  'agentforge::composition::Team',
  'agentforge::composition::Router',
  'agentforge::composition::Handoff',
] as const;

const SUPPORTED_SET = new Set<string>(SUPPORTED_RESOURCE_TYPES);

// ─── LocalTargetCompiler ────────────────────────────────────────────────────

/**
 * Compiles an Agent Assembly into a locally-runnable Node.js project.
 *
 * The compiled output uses the Vercel AI SDK for model invocation,
 * tool calling, and MCP server integration. The generated project
 * is a standalone TypeScript project executed via `tsx`.
 *
 * @example
 * ```ts
 * const compiler = new LocalTargetCompiler();
 * const validation = compiler.validate(assembly);
 * if (validation.valid) {
 *   const result = compiler.compile(assembly, './agentforge.out/local');
 *   await compiler.deploy(result, { projectDir: './agentforge.out/local' });
 * }
 * ```
 */
export class LocalTargetCompiler implements ITargetCompiler {
  /** @inheritdoc */
  readonly name = 'local' as const;

  /** @inheritdoc */
  readonly version = '0.1.0' as const;

  // ─── Validate ──────────────────────────────────────────────────────

  /**
   * Validate that the assembly is compatible with the local target.
   *
   * The local target requires at least one Agent resource. It warns
   * about any resource types it does not support (they will be skipped
   * during compilation).
   *
   * @param assembly - The Agent Assembly to validate.
   * @returns Validation result.
   */
  validate(assembly: AgentAssembly): ValidationResult {
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
        `Resource type '${type}' is not supported by the local target and will be skipped.`,
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
   * Compile the assembly into a runnable Node.js project.
   *
   * Generates the following structure in `outDir`:
   * - `runtime.ts` — main entrypoint (interactive CLI)
   * - `agents/<name>.ts` — per-agent runtime modules
   * - `tools/` — copied tool handler assets
   * - `config.json` — resolved configuration
   * - `package.json` — project manifest with dependencies
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

    // ── Generate package.json ──────────────────────────────────────
    const packageJson = generatePackageJson(assembly);
    const packageJsonPath = join(outDir, 'package.json');
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
    artifacts.push({
      path: 'package.json',
      type: 'package',
      description: 'Runtime project manifest with Vercel AI SDK dependencies',
    });

    // ── Generate config.json ───────────────────────────────────────
    const configJson = generateConfigJson(assembly);
    const configJsonPath = join(outDir, 'config.json');
    writeFileSync(configJsonPath, JSON.stringify(configJson, null, 2) + '\n', 'utf-8');
    artifacts.push({
      path: 'config.json',
      type: 'config',
      description: 'Resolved agent, model, tool, and MCP configuration',
    });

    // ── Generate agent modules ─────────────────────────────────────
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

    // ── Copy tool handler assets ───────────────────────────────────
    for (const resource of Object.values(assembly.resources)) {
      if (resource.type !== 'agentforge::core::Tool') continue;

      for (const assetRef of resource.assetRefs) {
        const destFileName = assetRef.assemblyPath.split('/').pop() ?? assetRef.assetId;
        const destPath = join(outDir, 'tools', destFileName);

        // The asset source path is relative to the assembly directory.
        // In a real pipeline, the assembly directory is passed in or
        // assets are embedded. For now, we write a placeholder if the
        // source doesn't exist.
        const assemblyDir = dirname(outDir);
        const assetSourcePath = join(assemblyDir, assetRef.assemblyPath);

        if (existsSync(assetSourcePath)) {
          mkdirSync(dirname(destPath), { recursive: true });
          copyFileSync(assetSourcePath, destPath);
        } else {
          // Write a stub file that logs the missing asset.
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

    // ── Generate runtime entrypoint ────────────────────────────────
    const runtimeCode = generateRuntime(agentNames);
    const runtimePath = join(outDir, 'runtime.ts');
    writeFileSync(runtimePath, runtimeCode, 'utf-8');
    artifacts.push({
      path: 'runtime.ts',
      type: 'source',
      description: 'Main entrypoint — interactive CLI for chatting with agents',
    });

    return {
      artifacts,
      warnings,
      unsupportedResources,
    };
  }

  // ─── Deploy ────────────────────────────────────────────────────────

  /**
   * Deploy the compiled project by installing dependencies and
   * starting the runtime process.
   *
   * 1. Runs `npm install` in the project directory.
   * 2. Spawns `npx tsx runtime.ts` as a child process.
   * 3. Returns the process handle so it can be stopped later.
   *
   * @param artifacts - The compile result (used for metadata).
   * @param options   - Deployment options (must include projectDir).
   * @returns Deployment result with process handle.
   */
  async deploy(artifacts: CompileResult, options: DeployOptions): Promise<DeployResult> {
    const { projectDir } = options;

    // Step 1: Install dependencies.
    await this.runCommand('npm', ['install'], projectDir);

    // Step 2: Start the runtime.
    const runtimeProcess = spawn('npx', ['tsx', 'runtime.ts'], {
      cwd: projectDir,
      stdio: 'inherit',
      env: { ...process.env },
    });

    // Give the process a moment to fail fast if there's an error.
    const startupResult = await new Promise<DeployResult>((resolve) => {
      let settled = false;

      runtimeProcess.on('error', (err) => {
        if (!settled) {
          settled = true;
          resolve({
            success: false,
            resources: {},
            process: runtimeProcess,
          });
        }
      });

      // If the process is still alive after 1s, consider it started.
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({
            success: true,
            resources: {
              runtime: {
                status: 'running',
                outputs: {
                  pid: String(runtimeProcess.pid ?? 'unknown'),
                  projectDir,
                },
              },
            },
            process: runtimeProcess,
          });
        }
      }, 1000);
    });

    return startupResult;
  }

  // ─── Destroy ───────────────────────────────────────────────────────

  /**
   * Tear down a deployed runtime by killing the process.
   *
   * @param deployResult - The result from a previous deploy() call.
   */
  async destroy(deployResult: DeployResult): Promise<void> {
    const proc = deployResult.process as ReturnType<typeof spawn> | undefined;
    if (proc && typeof proc.kill === 'function') {
      proc.kill('SIGTERM');

      // Wait for graceful shutdown (up to 5s), then force kill.
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // Process may already be dead.
          }
          resolve();
        }, 5000);

        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }

  // ─── Supported Resource Types ──────────────────────────────────────

  /**
   * List the resource types supported by the local target.
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

  /**
   * Run a shell command in the given directory and wait for it to complete.
   */
  private runCommand(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        stdio: 'inherit',
        env: { ...process.env },
      });

      proc.on('error', reject);

      proc.on('exit', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command '${command} ${args.join(' ')}' exited with code ${code}`));
        }
      });
    });
  }
}
