import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AssetManager } from '../assets.js';
import { AgentForgeError } from '../errors.js';

const TEST_ROOT = join(import.meta.dirname, '__test_assets_tmp__');
const PROJECT_ROOT = join(TEST_ROOT, 'project');
const STACK_OUT_DIR = join(TEST_ROOT, 'out');

function sha256(content: string | Buffer): string {
  return createHash('sha256')
    .update(typeof content === 'string' ? Buffer.from(content, 'utf-8') : content)
    .digest('hex');
}

beforeEach(() => {
  mkdirSync(PROJECT_ROOT, { recursive: true });
  mkdirSync(STACK_OUT_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── copyAsset ───────────────────────────────────────────────────────────────

describe('AssetManager.copyAsset', () => {
  it('copies a file into the assets directory with content-hash name', () => {
    const content = 'Hello, world!';
    const srcPath = join(PROJECT_ROOT, 'prompt.md');
    writeFileSync(srcPath, content);

    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    const ref = manager.copyAsset('prompt.md', 'prompt_file', 'Stack/Prompt');

    expect(ref.assetType).toBe('prompt_file');
    expect(ref.contentHash).toBe(sha256(content));
    expect(ref.assemblyPath).toBe(`assets/${sha256(content)}.md`);
    expect(ref.sourcePath).toBe('prompt.md');
    expect(ref.sizeBytes).toBe(Buffer.from(content).length);

    // Verify the file was actually copied
    const destPath = join(STACK_OUT_DIR, ref.assemblyPath);
    expect(existsSync(destPath)).toBe(true);
    expect(readFileSync(destPath, 'utf-8')).toBe(content);
  });

  it('resolves absolute source paths', () => {
    const content = 'absolute content';
    const srcPath = join(PROJECT_ROOT, 'abs.txt');
    writeFileSync(srcPath, content);

    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    const ref = manager.copyAsset(srcPath, 'data_file', 'Stack/Data');
    expect(ref.contentHash).toBe(sha256(content));
    expect(ref.assemblyPath).toContain('.txt');
  });

  it('deduplicates files with identical content', () => {
    const content = 'duplicate content';
    const src1 = join(PROJECT_ROOT, 'file1.txt');
    const src2 = join(PROJECT_ROOT, 'file2.txt');
    writeFileSync(src1, content);
    writeFileSync(src2, content);

    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    const ref1 = manager.copyAsset('file1.txt', 'data_file', 'Stack/A');
    const ref2 = manager.copyAsset('file2.txt', 'data_file', 'Stack/B');

    expect(ref1).toBe(ref2); // Same reference object
    expect(manager.size).toBe(1);
  });

  it('keeps different files separate', () => {
    writeFileSync(join(PROJECT_ROOT, 'a.txt'), 'content A');
    writeFileSync(join(PROJECT_ROOT, 'b.txt'), 'content B');

    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    const refA = manager.copyAsset('a.txt', 'data_file', 'Stack/A');
    const refB = manager.copyAsset('b.txt', 'data_file', 'Stack/B');

    expect(refA.contentHash).not.toBe(refB.contentHash);
    expect(manager.size).toBe(2);
  });

  it('throws AgentForgeError when source file does not exist', () => {
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    expect(() =>
      manager.copyAsset('nonexistent.txt', 'data_file', 'Stack/Missing'),
    ).toThrow(AgentForgeError);
  });

  it('preserves file extension in assembly path', () => {
    writeFileSync(join(PROJECT_ROOT, 'schema.json'), '{}');
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    const ref = manager.copyAsset('schema.json', 'schema_file', 'Stack/Schema');
    expect(ref.assemblyPath).toMatch(/\.json$/);
  });
});

// ─── writeAsset ──────────────────────────────────────────────────────────────

describe('AssetManager.writeAsset', () => {
  it('writes string content as an asset', () => {
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    const content = 'function handler() { return "ok"; }';
    const ref = manager.writeAsset(content, 'handler.js', 'tool_handler');

    expect(ref.assetType).toBe('tool_handler');
    expect(ref.contentHash).toBe(sha256(content));
    expect(ref.assemblyPath).toBe(`assets/${sha256(content)}.js`);
    expect(ref.sourcePath).toBe('<generated>/handler.js');
    expect(ref.sizeBytes).toBe(Buffer.from(content, 'utf-8').length);

    const destPath = join(STACK_OUT_DIR, ref.assemblyPath);
    expect(readFileSync(destPath, 'utf-8')).toBe(content);
  });

  it('writes Buffer content as an asset', () => {
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
    const ref = manager.writeAsset(buf, 'image.png', 'binary');

    expect(ref.sizeBytes).toBe(4);
    const destPath = join(STACK_OUT_DIR, ref.assemblyPath);
    expect(readFileSync(destPath)).toEqual(buf);
  });

  it('deduplicates written assets with same content', () => {
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    const content = 'same content';
    const ref1 = manager.writeAsset(content, 'a.js', 'tool_handler');
    const ref2 = manager.writeAsset(content, 'b.js', 'tool_handler');
    expect(ref1).toBe(ref2);
    expect(manager.size).toBe(1);
  });
});

// ─── resolveAssetRef ─────────────────────────────────────────────────────────

describe('AssetManager.resolveAssetRef', () => {
  it('returns assembly path for a previously copied asset', () => {
    const content = 'resolvable';
    writeFileSync(join(PROJECT_ROOT, 'file.txt'), content);

    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    manager.copyAsset('file.txt', 'data_file', 'Stack/A');

    const resolved = manager.resolveAssetRef('file.txt');
    expect(resolved).toBe(`assets/${sha256(content)}.txt`);
  });

  it('returns undefined for non-existent source path', () => {
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    expect(manager.resolveAssetRef('nope.txt')).toBeUndefined();
  });

  it('returns undefined for existing file that was not copied', () => {
    writeFileSync(join(PROJECT_ROOT, 'uncopied.txt'), 'uncopied');
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    expect(manager.resolveAssetRef('uncopied.txt')).toBeUndefined();
  });
});

// ─── getAllRefs ───────────────────────────────────────────────────────────────

describe('AssetManager.getAllRefs', () => {
  it('returns all produced asset refs', () => {
    writeFileSync(join(PROJECT_ROOT, 'a.txt'), 'A');
    writeFileSync(join(PROJECT_ROOT, 'b.txt'), 'B');

    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    manager.copyAsset('a.txt', 'data_file', 'Stack/A');
    manager.copyAsset('b.txt', 'data_file', 'Stack/B');

    const refs = manager.getAllRefs();
    expect(refs).toHaveLength(2);
  });

  it('returns a copy (mutations do not affect manager)', () => {
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    const refs = manager.getAllRefs();
    refs.push({} as never);
    expect(manager.getAllRefs()).toHaveLength(0);
  });
});

// ─── has / size ──────────────────────────────────────────────────────────────

describe('AssetManager.has / size', () => {
  it('has() returns true for known content hashes', () => {
    const content = 'check-has';
    writeFileSync(join(PROJECT_ROOT, 'x.txt'), content);
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    manager.copyAsset('x.txt', 'data_file', 'Stack/X');
    expect(manager.has(sha256(content))).toBe(true);
    expect(manager.has('bogus')).toBe(false);
  });

  it('size returns 0 for fresh manager', () => {
    const manager = new AssetManager(PROJECT_ROOT, STACK_OUT_DIR);
    expect(manager.size).toBe(0);
  });
});
