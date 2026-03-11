/**
 * @agentforge/state — State file management.
 *
 * Provides the {@link StateManager} class that handles reading, writing, and
 * querying the on-disk state file for a given project and deployment target.
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StateFile, StateResource } from './types.js';

// ---------------------------------------------------------------------------
// StateManager
// ---------------------------------------------------------------------------

/**
 * Manages a single state file at `{projectDir}/.agentforge/state-{target}.json`.
 *
 * All write operations are atomic (write to a temporary file, then rename) to
 * prevent corruption from interrupted processes.
 */
export class StateManager {
  /** Absolute path to the state file. */
  public readonly filePath: string;

  /**
   * @param projectDir - Absolute path to the AgentForge project root.
   * @param target - Deployment target name (e.g. `'local'`, `'docker'`).
   */
  constructor(
    private readonly projectDir: string,
    private readonly target: string,
  ) {
    this.filePath = join(projectDir, '.agentforge', `state-${target}.json`);
  }

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  /**
   * Read and parse the state file.
   *
   * @returns The parsed {@link StateFile}, or `null` if the file does not exist.
   */
  async read(): Promise<StateFile | null> {
    if (!this.exists()) {
      return null;
    }

    const raw = await readFile(this.filePath, 'utf8');
    return JSON.parse(raw) as StateFile;
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  /**
   * Atomically write the state file to disk.
   *
   * The file is first written to a temporary sibling path and then renamed
   * into place so that a crash mid-write never leaves a corrupt state file.
   *
   * @param state - The full {@link StateFile} to persist.
   */
  write(state: StateFile): void {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });

    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      // Best-effort cleanup of the temp file on failure.
      try {
        rmSync(tmpPath, { force: true });
      } catch {
        // Ignore cleanup errors.
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Existence check
  // -----------------------------------------------------------------------

  /**
   * Check whether the state file exists on disk.
   *
   * @returns `true` if the file exists, `false` otherwise.
   */
  exists(): boolean {
    return existsSync(this.filePath);
  }

  // -----------------------------------------------------------------------
  // Resource helpers
  // -----------------------------------------------------------------------

  /**
   * Retrieve a single resource record from the state file.
   *
   * @param id - The construct-tree address of the resource.
   * @returns The {@link StateResource} if found, or `null`.
   */
  async getResource(id: string): Promise<StateResource | null> {
    const state = await this.read();
    if (!state) {
      return null;
    }
    return state.resources[id] ?? null;
  }

  /**
   * Add or update a resource record in the state file.
   *
   * If the state file does not yet exist, a new one is created with default
   * metadata.
   *
   * @param id - The construct-tree address of the resource.
   * @param resource - The {@link StateResource} data to store.
   */
  async setResource(id: string, resource: StateResource): Promise<void> {
    let state = await this.read();
    if (!state) {
      state = this.createEmptyState();
    }
    state.resources[id] = resource;
    this.write(state);
  }

  /**
   * Remove a resource record from the state file.
   *
   * If the state file does not exist or the resource is not present, this is
   * a no-op.
   *
   * @param id - The construct-tree address of the resource to remove.
   */
  async removeResource(id: string): Promise<void> {
    const state = await this.read();
    if (!state) {
      return;
    }
    delete state.resources[id];
    this.write(state);
  }

  // -----------------------------------------------------------------------
  // Clear
  // -----------------------------------------------------------------------

  /**
   * Delete the state file from disk.
   *
   * This is a destructive operation — after calling `clear()` the manager
   * will behave as though no deployment has ever occurred for this target.
   */
  clear(): void {
    rmSync(this.filePath, { force: true });
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Create a blank {@link StateFile} with sensible defaults. */
  private createEmptyState(): StateFile {
    return {
      version: 1,
      target: this.target,
      resources: {},
      metadata: {
        lastBuildAt: new Date().toISOString(),
        assemblyHash: '',
      },
    };
  }
}
