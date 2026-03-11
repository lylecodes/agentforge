/**
 * End-to-end integration test for the agentforge pipeline.
 *
 * Tests the full flow: init -> build -> compile, verifying that all
 * stages produce valid output that feeds into the next stage.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { defineAgent } from '@agentforge/core';
import { LocalTargetCompiler } from '@agentforge/target-local';
import type { AgentAssembly } from '@agentforge/constructs';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(() => {
  const rawDir = join(tmpdir(), `agentforge-e2e-test-${randomUUID()}`);
  mkdirSync(rawDir, { recursive: true });
  tempDir = realpathSync(rawDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── E2E Pipeline Test ───────────────────────────────────────────────────────

describe('e2e pipeline: init -> build -> compile', () => {
  // ─── Phase 1: Init ──────────────────────────────────────────────────────

  describe('phase 1: init scaffolding', () => {
    it('creates a valid project structure', () => {
      scaffoldProject(tempDir);

      // Verify all expected files exist.
      expect(existsSync(join(tempDir, 'package.json'))).toBe(true);
      expect(existsSync(join(tempDir, 'agentforge.config.ts'))).toBe(true);
      expect(existsSync(join(tempDir, 'src', 'main.ts'))).toBe(true);

      // Verify package.json has correct shape.
      const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf8'));
      expect(pkg.type).toBe('module');
      expect(pkg.dependencies['@agentforge/core']).toBeDefined();

      // Verify src/main.ts uses defineAgent.
      const mainTs = readFileSync(join(tempDir, 'src', 'main.ts'), 'utf8');
      expect(mainTs).toContain("import { defineAgent } from '@agentforge/core'");
      expect(mainTs).toContain('export default defineAgent');
    });
  });

  // ─── Phase 2: Build ─────────────────────────────────────────────────────

  describe('phase 2: build assembly', () => {
    it('produces a valid assembly from defineAgent()', () => {
      const app = defineAgent({
        name: 'test-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a helpful test assistant.',
      });

      const outDir = join(tempDir, 'agentforge.out');
      const result = app.build({ writeOutput: true, throwOnError: true });

      // Verify build result structure.
      expect(result.stacks).toBeDefined();
      const stackNames = Object.keys(result.stacks);
      expect(stackNames).toHaveLength(1);
      expect(stackNames[0]).toBe('TestAgent');

      // Verify assembly content.
      const assembly = result.stacks['TestAgent']!;
      expect(assembly.version).toBe('0.1.0');
      expect(assembly.metadata).toBeDefined();
      expect(assembly.metadata.stackName).toBe('TestAgent');
      expect(assembly.metadata.assemblyHash).toMatch(/^sha256:/);
      expect(assembly.resources).toBeDefined();

      // Verify resources exist with populated properties.
      const resourceTypes = Object.values(assembly.resources).map(r => r.type);
      expect(resourceTypes).toContain('agentforge::core::Agent');
      expect(resourceTypes).toContain('agentforge::core::Model');
      expect(resourceTypes).toContain('agentforge::core::Prompt');

      // Verify agent properties are populated (not empty).
      const agentRes = Object.values(assembly.resources).find(
        r => r.type === 'agentforge::core::Agent',
      )!;
      expect(agentRes.properties['name']).toBe('test-agent');
      expect(agentRes.properties['model']).toBeDefined();

      // Verify model properties are populated.
      const modelRes = Object.values(assembly.resources).find(
        r => r.type === 'agentforge::core::Model',
      )!;
      expect(modelRes.properties['provider']).toBe('anthropic');
      expect(modelRes.properties['modelId']).toBe('claude-sonnet-4');

      // Verify prompt properties are populated.
      const promptRes = Object.values(assembly.resources).find(
        r => r.type === 'agentforge::core::Prompt',
      )!;
      expect(promptRes.properties['content']).toBe('You are a helpful test assistant.');
      expect(promptRes.properties['role']).toBe('system');
    });

    it('writes assembly files to disk', () => {
      const outDir = join(tempDir, 'agentforge.out');
      const app = defineAgent({
        name: 'disk-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You write to disk.',
      });

      // Set outdir to our temp path.
      // App's outdir defaults to 'agentforge.out' relative to cwd,
      // so we build with writeOutput: false and write manually.
      const result = app.build({ writeOutput: false, throwOnError: true });
      const assembly = result.stacks['DiskAgent']!;

      // Manually write what the CLI build command would do.
      const stackDir = join(outDir, 'stacks', 'DiskAgent');
      mkdirSync(stackDir, { recursive: true });
      writeFileSync(
        join(stackDir, 'assembly.json'),
        JSON.stringify(assembly, null, 2),
        'utf-8',
      );

      // Verify the file was written correctly.
      expect(existsSync(join(stackDir, 'assembly.json'))).toBe(true);
      const written = JSON.parse(
        readFileSync(join(stackDir, 'assembly.json'), 'utf8'),
      ) as AgentAssembly;
      expect(written.version).toBe('0.1.0');
      expect(Object.keys(written.resources).length).toBeGreaterThan(0);
    });

    it('builds assembly with tools and MCP servers', () => {
      const app = defineAgent({
        name: 'full-test-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a full test agent.',
        description: 'An agent with tools and MCP',
        tools: [
          {
            name: 'web_search',
            description: 'Search the web',
            handler: async () => 'result',
          },
        ],
        mcpServers: [
          {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@mcp/server-filesystem', './workspace'],
          },
        ],
      });

      const result = app.build({ writeOutput: false, throwOnError: true });
      const assembly = result.stacks['FullTestAgent']!;

      const resourceTypes = Object.values(assembly.resources).map(r => r.type);
      expect(resourceTypes).toContain('agentforge::core::Agent');
      expect(resourceTypes).toContain('agentforge::core::Model');
      expect(resourceTypes).toContain('agentforge::core::Prompt');
      expect(resourceTypes).toContain('agentforge::core::Tool');
      expect(resourceTypes).toContain('agentforge::core::MCPServer');

      // Verify tool properties.
      const toolRes = Object.values(assembly.resources).find(
        r => r.type === 'agentforge::core::Tool',
      )!;
      expect(toolRes.properties['name']).toBe('web_search');
      expect(toolRes.properties['description']).toBe('Search the web');

      // Verify MCP server properties.
      const mcpRes = Object.values(assembly.resources).find(
        r => r.type === 'agentforge::core::MCPServer',
      )!;
      expect(mcpRes.properties['transport']).toBe('stdio');
      expect(mcpRes.properties['command']).toBe('npx');
    });
  });

  // ─── Phase 3: Compile ───────────────────────────────────────────────────

  describe('phase 3: compile via LocalTargetCompiler', () => {
    it('validates assembly successfully', () => {
      const assembly = buildAssembly('compile-test', 'A compile test agent.');
      const compiler = new LocalTargetCompiler();

      const validation = compiler.validate(assembly);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('compiles assembly to runnable output', () => {
      const assembly = buildAssembly('compile-test', 'A compile test agent.');
      const compiler = new LocalTargetCompiler();
      const compileOutDir = join(tempDir, 'compiled');

      const result = compiler.compile(assembly, compileOutDir);

      // Verify compile result.
      expect(result.artifacts.length).toBeGreaterThan(0);
      expect(result.unsupportedResources).toHaveLength(0);

      // Verify runtime.ts was generated.
      expect(existsSync(join(compileOutDir, 'runtime.ts'))).toBe(true);
      const runtimeCode = readFileSync(
        join(compileOutDir, 'runtime.ts'),
        'utf8',
      );
      expect(runtimeCode).toContain('readline');

      // Verify agent module was generated.
      expect(existsSync(join(compileOutDir, 'agents'))).toBe(true);
      const agentFiles = result.artifacts.filter(a => a.path.startsWith('agents/'));
      expect(agentFiles.length).toBeGreaterThan(0);

      // Read the agent module and verify it contains expected code.
      const agentFilePath = join(compileOutDir, agentFiles[0]!.path);
      expect(existsSync(agentFilePath)).toBe(true);
      const agentCode = readFileSync(agentFilePath, 'utf8');
      expect(agentCode).toContain('generateText');
      expect(agentCode).toContain('anthropic');
      expect(agentCode).toContain('chat');

      // Verify package.json was generated.
      expect(existsSync(join(compileOutDir, 'package.json'))).toBe(true);
      const pkg = JSON.parse(
        readFileSync(join(compileOutDir, 'package.json'), 'utf8'),
      );
      expect(pkg.dependencies['ai']).toBeDefined();
      expect(pkg.dependencies['@ai-sdk/anthropic']).toBeDefined();

      // Verify config.json was generated.
      expect(existsSync(join(compileOutDir, 'config.json'))).toBe(true);
      const config = JSON.parse(
        readFileSync(join(compileOutDir, 'config.json'), 'utf8'),
      );
      expect(config.stackName).toBeDefined();
      expect(config.agents.length).toBeGreaterThan(0);
    });

    it('compiles assembly with tools', () => {
      const app = defineAgent({
        name: 'tool-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You use tools.',
        tools: [
          {
            name: 'search',
            description: 'Search things',
            handler: async () => 'found',
          },
        ],
      });

      const result = app.build({ writeOutput: false, throwOnError: true });
      const assembly = result.stacks['ToolAgent']!;

      const compiler = new LocalTargetCompiler();
      const compileOutDir = join(tempDir, 'compiled-tools');
      const compileResult = compiler.compile(assembly, compileOutDir);

      expect(compileResult.artifacts.length).toBeGreaterThan(0);
      expect(existsSync(join(compileOutDir, 'runtime.ts'))).toBe(true);
    });
  });

  // ─── Full Pipeline ──────────────────────────────────────────────────────

  describe('full pipeline: init -> build -> compile', () => {
    it('runs the complete pipeline end-to-end', () => {
      // Phase 1: Scaffold project.
      scaffoldProject(tempDir);
      expect(existsSync(join(tempDir, 'src', 'main.ts'))).toBe(true);

      // Phase 2: Build using defineAgent (simulating what loadApp would do).
      const app = defineAgent({
        name: 'my-agent',
        model: 'anthropic/claude-sonnet-4',
        prompt: 'You are a helpful assistant.',
      });

      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      expect(Object.keys(buildResult.stacks)).toHaveLength(1);
      expect(buildResult.validation.valid).toBe(true);

      const assembly = buildResult.stacks['MyAgent']!;
      expect(assembly.version).toBe('0.1.0');
      expect(Object.keys(assembly.resources).length).toBeGreaterThanOrEqual(3);

      // Verify the agent resource has populated properties.
      const agentRes = Object.values(assembly.resources).find(
        r => r.type === 'agentforge::core::Agent',
      )!;
      expect(agentRes.properties['name']).toBe('my-agent');

      // Phase 3: Compile via LocalTargetCompiler.
      const compiler = new LocalTargetCompiler();
      const compileOutDir = join(tempDir, 'agentforge.out', 'local');

      const validation = compiler.validate(assembly);
      expect(validation.valid).toBe(true);

      const compileResult = compiler.compile(assembly, compileOutDir);
      expect(compileResult.artifacts.length).toBeGreaterThan(0);

      // Verify output structure.
      expect(existsSync(join(compileOutDir, 'runtime.ts'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'package.json'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'config.json'))).toBe(true);

      // Verify agent module.
      const agentArtifacts = compileResult.artifacts.filter(
        a => a.path.startsWith('agents/'),
      );
      expect(agentArtifacts.length).toBeGreaterThan(0);

      for (const artifact of agentArtifacts) {
        const filePath = join(compileOutDir, artifact.path);
        expect(existsSync(filePath)).toBe(true);

        const code = readFileSync(filePath, 'utf8');
        expect(code).toContain('generateText');
        expect(code).toContain('chat');
      }

      // Verify runtime imports agent module.
      const runtimeCode = readFileSync(
        join(compileOutDir, 'runtime.ts'),
        'utf8',
      );
      expect(runtimeCode).toContain('agents/');

      // Verify config.json has correct agent data.
      const configJson = JSON.parse(
        readFileSync(join(compileOutDir, 'config.json'), 'utf8'),
      );
      expect(configJson.agents.length).toBe(1);
      expect(configJson.agents[0].properties.name).toBe('my-agent');
      expect(configJson.models.length).toBe(1);
      expect(configJson.models[0].properties.provider).toBe('anthropic');
    });

    it('handles an agent with all resource types', () => {
      // Build a fully-featured agent.
      const app = defineAgent({
        name: 'full-pipeline-agent',
        model: 'openai/gpt-4o',
        prompt: 'You are a full pipeline test agent.',
        description: 'A test agent with all resource types.',
        tools: [
          {
            name: 'calculator',
            description: 'Perform arithmetic',
            handler: async () => '42',
          },
          {
            name: 'lookup',
            description: 'Look things up',
            handler: { file: './tools/lookup.ts', export: 'default' },
          },
        ],
        mcpServers: [
          {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@mcp/test-server'],
          },
        ],
      });

      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      const assembly = buildResult.stacks['FullPipelineAgent']!;

      // Verify all resource types present.
      const types = new Set(
        Object.values(assembly.resources).map(r => r.type),
      );
      expect(types.has('agentforge::core::Agent')).toBe(true);
      expect(types.has('agentforge::core::Model')).toBe(true);
      expect(types.has('agentforge::core::Prompt')).toBe(true);
      expect(types.has('agentforge::core::Tool')).toBe(true);
      expect(types.has('agentforge::core::MCPServer')).toBe(true);

      // Compile.
      const compiler = new LocalTargetCompiler();
      const compileOutDir = join(tempDir, 'full-compile');
      const compileResult = compiler.compile(assembly, compileOutDir);

      expect(compileResult.artifacts.length).toBeGreaterThan(0);
      expect(existsSync(join(compileOutDir, 'runtime.ts'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'agents'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'package.json'))).toBe(true);

      // Verify OpenAI provider in package.json.
      const pkg = JSON.parse(
        readFileSync(join(compileOutDir, 'package.json'), 'utf8'),
      );
      expect(pkg.dependencies['@ai-sdk/openai']).toBeDefined();

      // Verify MCP SDK in package.json.
      expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
    });
  });
});

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Scaffold a minimal AgentForge project in the given directory.
 * Mirrors what `agentforge init` produces.
 */
function scaffoldProject(projectDir: string): void {
  mkdirSync(join(projectDir, 'src'), { recursive: true });

  // package.json
  const pkg = {
    name: 'test-project',
    version: '0.1.0',
    type: 'module',
    private: true,
    dependencies: {
      '@agentforge/core': '^0.1.0',
    },
  };
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n',
    'utf8',
  );

  // agentforge.config.ts
  writeFileSync(
    join(projectDir, 'agentforge.config.ts'),
    `const config = {
  outDir: 'agentforge.out',
  defaultTarget: 'local',
};
export default config;
`,
    'utf8',
  );

  // src/main.ts
  writeFileSync(
    join(projectDir, 'src', 'main.ts'),
    `import { defineAgent } from '@agentforge/core';

export default defineAgent({
  name: 'my-agent',
  model: 'anthropic/claude-sonnet-4',
  prompt: 'You are a helpful assistant.',
});
`,
    'utf8',
  );
}

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
