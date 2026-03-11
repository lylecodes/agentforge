/**
 * End-to-end integration test for the Docker target pipeline.
 *
 * Tests the full flow: App + Stack + Agent + Model -> build -> compile
 * with DockerTargetCompiler, verifying that all Docker-specific artifacts
 * are produced correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { App, Stack } from '@agentforge/constructs';
import { Agent, Model, Tool, Prompt, defineAgent } from '@agentforge/core';
import { DockerTargetCompiler } from '@agentforge/target-docker';
import type { AgentAssembly } from '@agentforge/constructs';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(() => {
  const rawDir = join(tmpdir(), `agentforge-e2e-docker-test-${randomUUID()}`);
  mkdirSync(rawDir, { recursive: true });
  tempDir = realpathSync(rawDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── E2E Docker Target Tests ─────────────────────────────────────────────────

describe('e2e: Docker target pipeline', () => {
  // ─── Programmatic Construct API ──────────────────────────────────────────

  describe('programmatic construct API (Tier 2)', () => {
    it('builds and compiles a full agent stack to Docker artifacts', () => {
      // 1. Create construct tree programmatically.
      const app = new App();
      const stack = new Stack(app, 'DockerTest');

      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web for information',
        handler: async () => 'search result',
      });

      new Agent(stack, 'ResearchBot', {
        name: 'research-bot',
        description: 'A research assistant agent',
        model,
        tools: [tool],
        prompt: 'You are a helpful research assistant.',
      });

      // 2. Build the assembly.
      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      expect(Object.keys(buildResult.stacks)).toHaveLength(1);
      expect(buildResult.stacks['DockerTest']).toBeDefined();

      const assembly = buildResult.stacks['DockerTest']!;

      // 3. Validate with DockerTargetCompiler.
      const compiler = new DockerTargetCompiler();
      const validation = compiler.validate(assembly);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // 4. Compile.
      const compileOutDir = join(tempDir, 'docker-out');
      const compileResult = compiler.compile(assembly, compileOutDir);

      // 5. Verify all Docker-specific artifacts are present.
      expect(compileResult.artifacts.length).toBeGreaterThanOrEqual(6);
      expect(compileResult.unsupportedResources).toHaveLength(0);

      const artifactPaths = compileResult.artifacts.map(a => a.path);

      // Dockerfile
      expect(artifactPaths).toContain('Dockerfile');
      expect(existsSync(join(compileOutDir, 'Dockerfile'))).toBe(true);
      const dockerfile = readFileSync(join(compileOutDir, 'Dockerfile'), 'utf-8');
      expect(dockerfile).toContain('FROM node:22-alpine');
      expect(dockerfile).toContain('HEALTHCHECK');

      // docker-compose.yml
      expect(artifactPaths).toContain('docker-compose.yml');
      expect(existsSync(join(compileOutDir, 'docker-compose.yml'))).toBe(true);
      const compose = readFileSync(join(compileOutDir, 'docker-compose.yml'), 'utf-8');
      expect(compose).toContain('services:');
      expect(compose).toContain('agent-runtime:');

      // package.json
      expect(artifactPaths).toContain('package.json');
      expect(existsSync(join(compileOutDir, 'package.json'))).toBe(true);
      const pkg = JSON.parse(readFileSync(join(compileOutDir, 'package.json'), 'utf-8'));
      expect(pkg.type).toBe('module');
      expect(pkg.dependencies['ai']).toBeDefined();
      expect(pkg.dependencies['@ai-sdk/anthropic']).toBeDefined();

      // runtime.ts
      expect(artifactPaths).toContain('runtime.ts');
      expect(existsSync(join(compileOutDir, 'runtime.ts'))).toBe(true);
      const runtime = readFileSync(join(compileOutDir, 'runtime.ts'), 'utf-8');
      expect(runtime).toContain('createServer');
      expect(runtime).toContain('/health');
      expect(runtime).toContain('ResearchBot');

      // Agent module
      expect(artifactPaths).toContain('agents/ResearchBot.ts');
      expect(existsSync(join(compileOutDir, 'agents', 'ResearchBot.ts'))).toBe(true);
      const agentCode = readFileSync(join(compileOutDir, 'agents', 'ResearchBot.ts'), 'utf-8');
      expect(agentCode).toContain('export async function chat');
      expect(agentCode).toContain('anthropic');
    });
  });

  // ─── defineAgent API ─────────────────────────────────────────────────────

  describe('defineAgent API (Tier 1)', () => {
    it('builds and compiles a defineAgent app to Docker artifacts', () => {
      const app = defineAgent({
        name: 'docker-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a Docker-deployed assistant.',
        description: 'An agent deployed via Docker',
        tools: [
          {
            name: 'calculator',
            description: 'Perform arithmetic calculations',
            handler: async () => '42',
          },
        ],
      });

      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      const assembly = buildResult.stacks['DockerAgent']!;

      const compiler = new DockerTargetCompiler();
      const validation = compiler.validate(assembly);
      expect(validation.valid).toBe(true);

      const compileOutDir = join(tempDir, 'docker-define');
      const compileResult = compiler.compile(assembly, compileOutDir);

      // Verify core artifacts exist.
      expect(existsSync(join(compileOutDir, 'Dockerfile'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'docker-compose.yml'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'package.json'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'runtime.ts'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'agents'))).toBe(true);

      // Verify agent module references the tool.
      const agentFiles = compileResult.artifacts.filter(a => a.path.startsWith('agents/'));
      expect(agentFiles.length).toBeGreaterThan(0);

      // Verify runtime references the agent.
      const runtime = readFileSync(join(compileOutDir, 'runtime.ts'), 'utf-8');
      expect(runtime).toContain('Agent');
    });
  });

  // ─── Multi-Agent Assembly ────────────────────────────────────────────────

  describe('multi-agent Docker compilation', () => {
    it('compiles multiple agents into separate modules with shared runtime', () => {
      const app = new App();
      const stack = new Stack(app, 'MultiAgent');

      const model = new Model(stack, 'Claude', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      new Agent(stack, 'Researcher', {
        name: 'researcher',
        model,
        prompt: 'You research topics.',
      });

      new Agent(stack, 'Writer', {
        name: 'writer',
        model,
        prompt: 'You write content.',
      });

      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      const assembly = buildResult.stacks['MultiAgent']!;

      const compiler = new DockerTargetCompiler();
      const compileOutDir = join(tempDir, 'docker-multi');
      const compileResult = compiler.compile(assembly, compileOutDir);

      // Both agent modules should exist.
      expect(existsSync(join(compileOutDir, 'agents', 'Researcher.ts'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'agents', 'Writer.ts'))).toBe(true);

      // Runtime should reference both agents.
      const runtime = readFileSync(join(compileOutDir, 'runtime.ts'), 'utf-8');
      expect(runtime).toContain('Researcher');
      expect(runtime).toContain('Writer');
      expect(runtime).toContain('2 agent(s) available');

      // docker-compose should have the runtime service.
      const compose = readFileSync(join(compileOutDir, 'docker-compose.yml'), 'utf-8');
      expect(compose).toContain('agent-runtime:');
    });
  });

  // ─── Docker vs Local Comparison ──────────────────────────────────────────

  describe('docker target produces HTTP server (not readline)', () => {
    it('docker runtime uses createServer, not readline', () => {
      const assembly = buildAssembly('http-test', 'You serve HTTP.');

      const compiler = new DockerTargetCompiler();
      const compileOutDir = join(tempDir, 'docker-http');
      compiler.compile(assembly, compileOutDir);

      const runtime = readFileSync(join(compileOutDir, 'runtime.ts'), 'utf-8');
      expect(runtime).toContain('createServer');
      expect(runtime).toContain('/health');
      expect(runtime).toContain('/agents');
      expect(runtime).not.toContain('readline');
    });
  });

  // ─── Validation ──────────────────────────────────────────────────────────

  describe('validation', () => {
    it('rejects assembly without agents', () => {
      const app = new App();
      const stack = new Stack(app, 'NoAgent');

      new Model(stack, 'Model', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      const assembly = buildResult.stacks['NoAgent']!;

      const compiler = new DockerTargetCompiler();
      const validation = compiler.validate(assembly);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Agent'))).toBe(true);
    });
  });
});

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Build a simple assembly for testing compilation.
 */
function buildAssembly(name: string, prompt: string): AgentAssembly {
  const app = defineAgent({
    name,
    model: 'anthropic/claude-sonnet-4',
    prompt,
  });

  const pascalName = name
    .split(/[-_\s]+/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

  const result = app.build({ writeOutput: false, throwOnError: true });
  return result.stacks[pascalName]!;
}
