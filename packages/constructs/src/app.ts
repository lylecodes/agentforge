/**
 * @module app
 *
 * App — the root of an AgentForge construct tree.
 *
 * The App class drives the synthesis pipeline: it walks all child stacks,
 * resolves tokens, runs validation, applies aspects, and produces the
 * Agent Assembly output.
 *
 * @see Phase 1 items 1.2 and 1.3 of the AgentForge roadmap.
 */

import { Construct, RootConstruct } from 'constructs';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentAssembly, ProtocolArtifacts } from './assembly.js';
import { Stack } from './stack.js';
import { TokenMap, resolveTokens, resolveValue } from './tokens.js';
import { AgentForgeError } from './errors.js';
import type { ValidationResult } from './validation.js';
import { toValidationResult, mergeValidationResults } from './validation.js';
import { generateAgentsMd } from './protocols.js';
import { Aspects } from './aspects.js';

// ─── App Props ──────────────────────────────────────────────────────────────

/**
 * Configuration properties for an App.
 */
export interface AppProps {
  /**
   * Output directory for the Agent Assembly.
   * @default "agentforge.out"
   */
  readonly outdir?: string;

  /**
   * AgentForge version string (set by the CLI).
   * @default "0.1.0"
   */
  readonly agentforgeVersion?: string;

  /**
   * Project root directory (used for asset resolution).
   * @default process.cwd()
   */
  readonly projectRoot?: string;
}

// ─── Build Result ───────────────────────────────────────────────────────────

/**
 * The result of an `App.build()` call.
 */
export interface BuildResult {
  /** Assembly data for each stack, keyed by stack name. */
  readonly stacks: Record<string, AgentAssembly>;

  /** Validation result across all stacks. */
  readonly validation: ValidationResult;

  /** Absolute path to the output directory. */
  readonly outdir: string;
}

// ─── App Class ──────────────────────────────────────────────────────────────

/**
 * The root construct of an AgentForge application.
 *
 * An App is the entry point for defining agent systems. It contains one or
 * more {@link Stack} children, each representing a deployment unit. The
 * `build()` method drives the full synthesis pipeline.
 *
 * @example
 * ```ts
 * const app = new App();
 *
 * const stack = new Stack(app, 'MyStack', {
 *   environment: 'production',
 * });
 *
 * // ... define resources in the stack ...
 *
 * const result = app.build();
 * console.log(result.stacks['MyStack']);
 * ```
 */
export class App extends RootConstruct {
  /** Output directory for the Agent Assembly. */
  public readonly outdir: string;

  /** AgentForge version string. */
  public readonly agentforgeVersion: string;

  /** Project root directory. */
  public readonly projectRoot: string;

  /** Global token map shared by all constructs in this app. */
  public readonly tokenMap: TokenMap;

  constructor(props?: AppProps) {
    super('App');
    this.outdir = props?.outdir ?? 'agentforge.out';
    this.agentforgeVersion = props?.agentforgeVersion ?? '0.1.0';
    this.projectRoot = props?.projectRoot ?? process.cwd();
    this.tokenMap = new TokenMap();
  }

  // ─── Build (was synth) ─────────────────────────────────────────────────

  /**
   * Build the Agent Assembly.
   *
   * Executes the full synthesis pipeline:
   * 1. Discover all Stack children
   * 2. Resolve tokens (topological sort with cycle detection)
   * 3. Validate all resources (property checks, secret leak detection)
   * 4. Apply Aspects (visitor pattern)
   * 5. Serialize each stack to AgentAssembly
   * 6. Generate protocol artifacts (AGENTS.md, etc.)
   * 7. Compute assembly hashes
   * 8. Write output to `agentforge.out/`
   *
   * @param writeOutput - Whether to write the output to disk (default: true).
   * @returns The build result with all assemblies and validation results.
   * @throws {AgentForgeError} If validation produces errors and `throwOnError` is true.
   */
  build(options?: { writeOutput?: boolean; throwOnError?: boolean }): BuildResult {
    const writeOutput = options?.writeOutput ?? true;
    const throwOnError = options?.throwOnError ?? true;

    // 1. Discover stacks
    const stacks = this.findStacks();

    // 2. Resolve tokens
    resolveTokens(this.tokenMap);

    // 3. Validate all stacks
    const validationResults: ValidationResult[] = [];
    for (const stack of stacks) {
      const diagnostics = stack.collectDiagnostics();
      validationResults.push(toValidationResult(diagnostics));
    }
    const mergedValidation = mergeValidationResults(...validationResults);

    // Throw on validation errors if configured
    if (throwOnError && !mergedValidation.valid) {
      const firstError = mergedValidation.errors[0]!;
      throw new AgentForgeError(firstError);
    }

    // 4. Apply Aspects (visitor pattern)
    Aspects.invokeAll(this);

    // 5. Synthesize each stack
    const assemblies: Record<string, AgentAssembly> = {};

    for (const stack of stacks) {
      // 6. Generate protocol artifacts for this stack
      const resources = stack.collectResources();
      const protocols = this.generateProtocols(resources);

      // Synthesize the assembly
      let assembly = stack.synthesize(this.agentforgeVersion, protocols);

      // Resolve any remaining tokens in properties
      assembly = this.resolveAssemblyTokens(assembly);

      // 7. Compute assembly hash
      assembly = this.computeAssemblyHash(assembly);

      assemblies[stack.node.id] = assembly;

      // 8. Write output
      if (writeOutput) {
        this.writeStackOutput(stack.node.id, assembly);
      }
    }

    // Write manifest.json and tree.json
    if (writeOutput && stacks.length > 0) {
      this.writeManifest(stacks, assemblies);
      this.writeTree();
    }

    return {
      stacks: assemblies,
      validation: mergedValidation,
      outdir: this.outdir,
    };
  }

  // ─── Stack Discovery ──────────────────────────────────────────────────

  /**
   * Find all Stack children of this App.
   */
  private findStacks(): Stack[] {
    const stacks: Stack[] = [];
    for (const child of this.node.children) {
      if (Stack.isStack(child as Construct)) {
        stacks.push(child as Stack);
      }
    }
    return stacks;
  }

  // ─── Token Resolution in Assembly ─────────────────────────────────────

  /**
   * Resolve any remaining token markers in assembly resource properties.
   */
  private resolveAssemblyTokens(assembly: AgentAssembly): AgentAssembly {
    const resolvedResources: Record<string, import('./assembly.js').AgentResource> = {};

    for (const [id, resource] of Object.entries(assembly.resources)) {
      resolvedResources[id] = {
        ...resource,
        properties: resolveValue(resource.properties, this.tokenMap) as Record<string, unknown>,
      };
    }

    return {
      ...assembly,
      resources: resolvedResources,
    };
  }

  // ─── Assembly Hash ────────────────────────────────────────────────────

  /**
   * Compute the SHA-256 hash of the assembly (excluding the hash field itself).
   */
  private computeAssemblyHash(assembly: AgentAssembly): AgentAssembly {
    // Serialize without the hash field
    const forHashing = {
      ...assembly,
      metadata: {
        ...assembly.metadata,
        assemblyHash: '',
      },
    };

    const json = JSON.stringify(forHashing, null, 2);
    const hash = createHash('sha256').update(json).digest('hex');

    return {
      ...assembly,
      metadata: {
        ...assembly.metadata,
        assemblyHash: `sha256:${hash}`,
      },
    };
  }

  // ─── Protocol Artifact Generation ─────────────────────────────────────

  /**
   * Generate protocol artifacts from the collected resources.
   */
  private generateProtocols(
    resources: Record<string, import('./assembly.js').AgentResource>,
  ): ProtocolArtifacts {
    const agentsMdContent = generateAgentsMd(resources);
    const agentsMdHash = createHash('sha256')
      .update(agentsMdContent)
      .digest('hex');

    return {
      agentsMd: {
        path: 'protocols/AGENTS.md',
        contentHash: agentsMdHash,
      },
    };
  }

  // ─── Output Writing ───────────────────────────────────────────────────

  /**
   * Write a stack's assembly output to disk.
   */
  private writeStackOutput(stackName: string, assembly: AgentAssembly): void {
    const stackDir = join(this.outdir, 'stacks', stackName);
    mkdirSync(stackDir, { recursive: true });

    // Write assembly.json
    const assemblyPath = join(stackDir, 'assembly.json');
    writeFileSync(assemblyPath, JSON.stringify(assembly, null, 2), 'utf-8');

    // Write AGENTS.md if generated
    if (assembly.protocols.agentsMd) {
      const protocolsDir = join(stackDir, 'protocols');
      mkdirSync(protocolsDir, { recursive: true });
      const agentsMdContent = generateAgentsMd(assembly.resources);
      writeFileSync(
        join(protocolsDir, 'AGENTS.md'),
        agentsMdContent,
        'utf-8',
      );
    }
  }

  /**
   * Write the top-level manifest.json.
   */
  private writeManifest(
    stacks: Stack[],
    assemblies: Record<string, AgentAssembly>,
  ): void {
    mkdirSync(this.outdir, { recursive: true });

    const manifest = {
      version: '1.0',
      agentforgeVersion: this.agentforgeVersion,
      stacks: stacks.map((s) => ({
        name: s.node.id,
        environment: s.environment,
        assemblyPath: `stacks/${s.node.id}/assembly.json`,
        assemblyHash: assemblies[s.node.id]?.metadata.assemblyHash,
      })),
      synthesizedAt: new Date().toISOString(),
    };

    writeFileSync(
      join(this.outdir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );
  }

  /**
   * Write the construct tree visualization (tree.json).
   */
  private writeTree(): void {
    mkdirSync(this.outdir, { recursive: true });

    const tree = this.buildTreeNode(this);
    writeFileSync(
      join(this.outdir, 'tree.json'),
      JSON.stringify(tree, null, 2),
      'utf-8',
    );
  }

  /**
   * Recursively build a tree node for visualization.
   */
  private buildTreeNode(construct: Construct): TreeNode {
    const children: Record<string, TreeNode> = {};
    for (const child of construct.node.children) {
      if (child instanceof Construct) {
        children[child.node.id] = this.buildTreeNode(child);
      }
    }

    return {
      id: construct.node.id,
      path: construct.node.path,
      constructInfo: construct.constructor.name,
      children: Object.keys(children).length > 0 ? children : undefined,
    };
  }
}

// ─── Tree Node (for tree.json) ──────────────────────────────────────────────

/**
 * A node in the construct tree visualization.
 */
interface TreeNode {
  id: string;
  path: string;
  constructInfo: string;
  children?: Record<string, TreeNode>;
}
