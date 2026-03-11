/**
 * @module assets
 *
 * Asset management for AgentForge.
 *
 * Assets are files referenced by constructs (prompt templates, tool handler
 * scripts, schema definitions, binary files) that must be bundled into the
 * assembly. The AssetManager handles copying, content-hashing, deduplication,
 * and reference rewriting.
 *
 * @see Section 2.9 of the AgentForge roadmap.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import type { AssetRefEntry, AssetType } from './assembly.js';
import { AgentForgeError, assetNotFoundDiagnostic } from './errors.js';

// ─── Asset Manager ──────────────────────────────────────────────────────────

/**
 * Manages file assets referenced by constructs during synthesis.
 *
 * Responsibilities:
 * - Copy source files into the assembly `assets/` directory
 * - Content-hash filenames for deduplication
 * - Track all asset references for assembly serialization
 * - Detect duplicate assets (same content hash) and reuse entries
 *
 * @example
 * ```ts
 * const manager = new AssetManager('/project', '/project/agentforge.out/stacks/my-stack');
 * const ref = manager.copyAsset('./prompts/system.md', 'prompt_file', 'MyStack/System');
 * // ref.assemblyPath = "assets/a1b2c3d4.md"
 * ```
 */
export class AssetManager {
  /** Absolute path to the project root. */
  private readonly projectRoot: string;

  /** Absolute path to the stack output directory. */
  private readonly stackOutDir: string;

  /** Map from content hash to existing asset ref (deduplication). */
  private readonly hashIndex = new Map<string, AssetRefEntry>();

  /** All asset refs produced by this manager. */
  private readonly refs: AssetRefEntry[] = [];

  /**
   * @param projectRoot - Absolute path to the project root directory.
   * @param stackOutDir - Absolute path to the stack's output directory
   *                      (e.g., `agentforge.out/stacks/my-stack`).
   */
  constructor(projectRoot: string, stackOutDir: string) {
    this.projectRoot = projectRoot;
    this.stackOutDir = stackOutDir;
  }

  /**
   * Copy a file into the assembly `assets/` directory.
   *
   * If a file with the same content hash already exists, the copy is skipped
   * and the existing asset reference is returned (deduplication).
   *
   * @param sourcePath    - Path to the source file (relative to project root or absolute).
   * @param assetType     - Classification of the asset.
   * @param constructPath - Construct tree path that references this asset (for errors).
   * @returns The asset reference entry.
   * @throws {AgentForgeError} If the source file does not exist.
   */
  copyAsset(
    sourcePath: string,
    assetType: AssetType,
    constructPath: string,
  ): AssetRefEntry {
    const absolutePath = this.resolveSourcePath(sourcePath);

    if (!existsSync(absolutePath)) {
      throw new AgentForgeError(
        assetNotFoundDiagnostic(constructPath, sourcePath),
      );
    }

    const content = readFileSync(absolutePath);
    const contentHash = this.computeHash(content);

    // Deduplication: return existing ref if content already copied
    const existing = this.hashIndex.get(contentHash);
    if (existing) {
      return existing;
    }

    const stats = statSync(absolutePath);
    const ext = extname(absolutePath);
    const assemblyFileName = `${contentHash}${ext}`;
    const assemblyPath = `assets/${assemblyFileName}`;

    // Ensure assets/ directory exists
    const assetsDir = join(this.stackOutDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });

    // Copy the file
    const destPath = join(assetsDir, assemblyFileName);
    copyFileSync(absolutePath, destPath);

    const ref: AssetRefEntry = {
      assetId: contentHash,
      sourcePath: relative(this.projectRoot, absolutePath),
      assemblyPath,
      contentHash,
      assetType,
      sizeBytes: stats.size,
    };

    this.hashIndex.set(contentHash, ref);
    this.refs.push(ref);

    return ref;
  }

  /**
   * Write content directly as an asset (for extracted inline functions).
   *
   * @param content       - The file content to write.
   * @param fileName      - Desired filename (the actual name will be content-hash based).
   * @param assetType     - Classification of the asset.
   * @returns The asset reference entry.
   */
  writeAsset(
    content: string | Buffer,
    fileName: string,
    assetType: AssetType,
  ): AssetRefEntry {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const contentHash = this.computeHash(buffer);

    // Deduplication
    const existing = this.hashIndex.get(contentHash);
    if (existing) {
      return existing;
    }

    const ext = extname(fileName);
    const assemblyFileName = `${contentHash}${ext}`;
    const assemblyPath = `assets/${assemblyFileName}`;

    // Ensure assets/ directory exists
    const assetsDir = join(this.stackOutDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });

    // Write the file
    const destPath = join(assetsDir, assemblyFileName);
    writeFileSync(destPath, buffer);

    const ref: AssetRefEntry = {
      assetId: contentHash,
      sourcePath: `<generated>/${fileName}`,
      assemblyPath,
      contentHash,
      assetType,
      sizeBytes: buffer.length,
    };

    this.hashIndex.set(contentHash, ref);
    this.refs.push(ref);

    return ref;
  }

  /**
   * Resolve an asset reference path to its assembly-relative path.
   *
   * @param sourcePath - Original source path.
   * @returns The assembly-relative path, or `undefined` if not found.
   */
  resolveAssetRef(sourcePath: string): string | undefined {
    const absolutePath = this.resolveSourcePath(sourcePath);
    if (!existsSync(absolutePath)) {
      return undefined;
    }

    const content = readFileSync(absolutePath);
    const contentHash = this.computeHash(content);
    const existing = this.hashIndex.get(contentHash);
    return existing?.assemblyPath;
  }

  /**
   * Get all asset references produced during this build.
   */
  getAllRefs(): AssetRefEntry[] {
    return [...this.refs];
  }

  /**
   * Check whether an asset with the given content hash already exists.
   */
  has(contentHash: string): boolean {
    return this.hashIndex.has(contentHash);
  }

  /**
   * Get the total number of unique assets.
   */
  get size(): number {
    return this.hashIndex.size;
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * Resolve a source path (relative or absolute) to an absolute path.
   */
  private resolveSourcePath(sourcePath: string): string {
    if (sourcePath.startsWith('/')) {
      return sourcePath;
    }
    return join(this.projectRoot, sourcePath);
  }

  /**
   * Compute a SHA-256 content hash.
   */
  private computeHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
