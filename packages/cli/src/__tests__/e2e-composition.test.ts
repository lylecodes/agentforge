/**
 * End-to-end integration test for composition constructs.
 *
 * Tests the full flow: App + Stack + 3 Agents + Workflow + Team + Router +
 * Handoff -> build -> compile, verifying that all composition resources
 * and connections are produced correctly in the assembly IR.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { App, Stack } from '@agentforge/constructs';
import type { AgentAssembly, Connection } from '@agentforge/constructs';
import { Agent, Model } from '@agentforge/core';
import { LocalTargetCompiler } from '@agentforge/target-local';
import {
  Workflow,
  Team,
  Router,
  Handoff,
  TeamOrchestration,
  RoutingStrategy,
  HandoffTarget,
  HandoffTrigger,
} from '@agentforge/composition';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(() => {
  const rawDir = join(tmpdir(), `agentforge-e2e-composition-${randomUUID()}`);
  mkdirSync(rawDir, { recursive: true });
  tempDir = realpathSync(rawDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Helper: create an App + Stack with 3 agents (researcher, writer, editor).
 */
function createThreeAgentStack() {
  const app = new App();
  const stack = new Stack(app, 'CompositionTest');

  const researcherModel = new Model(stack, 'ResearcherModel', {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4',
  });
  const writerModel = new Model(stack, 'WriterModel', {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4',
  });
  const editorModel = new Model(stack, 'EditorModel', {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4',
  });

  const researcher = new Agent(stack, 'Researcher', {
    name: 'researcher',
    description: 'Researches topics and gathers information',
    model: researcherModel,
    prompt: 'You are a research assistant.',
  });

  const writer = new Agent(stack, 'Writer', {
    name: 'writer',
    description: 'Writes content based on research',
    model: writerModel,
    prompt: 'You are a content writer.',
  });

  const editor = new Agent(stack, 'Editor', {
    name: 'editor',
    description: 'Edits and polishes content',
    model: editorModel,
    prompt: 'You are a content editor.',
  });

  return { app, stack, researcher, writer, editor };
}

// ─── E2E Composition Tests ──────────────────────────────────────────────────

describe('e2e: composition pipeline', () => {
  // ─── Assembly with all composition constructs ─────────────────────────

  describe('build assembly with composition constructs', () => {
    it('creates assembly with Workflow, Team, Router, and Handoff resources', () => {
      const { app, stack, researcher, writer, editor } = createThreeAgentStack();

      // 1. Create a Workflow with the 3 agents as sequential steps.
      new Workflow(stack, 'ContentPipeline', {
        steps: [
          { agent: researcher, task: 'Research the topic: {topic}', name: 'research' },
          { agent: writer, task: 'Write an article based on: {research_output}', name: 'write' },
          { agent: editor, task: 'Edit and polish: {draft_output}', name: 'edit' },
        ],
        errorHandling: 'retry',
        maxRetries: 2,
      });

      // 2. Create a Team with editor as manager.
      new Team(stack, 'ContentTeam', {
        orchestration: TeamOrchestration.HIERARCHICAL,
        manager: editor,
        members: [
          { agent: researcher, role: 'researcher' },
          { agent: writer, role: 'writer' },
        ],
      });

      // 3. Create a Router with rule-based routing.
      new Router(stack, 'TaskRouter', {
        strategy: RoutingStrategy.RULE_BASED,
        routes: [
          { name: 'research', description: 'Research tasks', target: researcher, condition: 'intent === "research"' },
          { name: 'writing', description: 'Writing tasks', target: writer, condition: 'intent === "writing"' },
        ],
        defaultRoute: editor,
      });

      // 4. Create a Handoff from researcher to editor.
      new Handoff(stack, 'ResearchToEditor', {
        source: researcher,
        target: HandoffTarget.agent(editor),
        triggers: [
          HandoffTrigger.turnCount({ maxTurns: 5 }),
        ],
      });

      // ─── Build ──────────────────────────────────────────────────────

      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      expect(Object.keys(buildResult.stacks)).toHaveLength(1);
      expect(buildResult.stacks['CompositionTest']).toBeDefined();
      expect(buildResult.validation.valid).toBe(true);

      const assembly = buildResult.stacks['CompositionTest']!;

      // ─── Verify resources ───────────────────────────────────────────

      const resourceTypes = Object.values(assembly.resources).map(r => r.type);

      // Core resources: 3 agents, 3 models, 3 prompts.
      expect(resourceTypes.filter(t => t === 'agentforge::core::Agent')).toHaveLength(3);
      expect(resourceTypes.filter(t => t === 'agentforge::core::Model')).toHaveLength(3);
      expect(resourceTypes.filter(t => t === 'agentforge::core::Prompt')).toHaveLength(3);

      // Composition resources.
      expect(resourceTypes).toContain('agentforge::composition::Workflow');
      expect(resourceTypes).toContain('agentforge::composition::Team');
      expect(resourceTypes).toContain('agentforge::composition::Router');
      expect(resourceTypes).toContain('agentforge::composition::Handoff');

      // ─── Verify connections ─────────────────────────────────────────

      const connections = assembly.connections;
      const connectionTypes = connections.map(c => c.type);

      // workflow_step: 2 edges (researcher->writer, writer->editor).
      const workflowSteps = connections.filter(c => c.type === 'workflow_step');
      expect(workflowSteps).toHaveLength(2);

      // Verify workflow step ordering.
      expect(workflowSteps[0]!.order).toBe(0);
      expect(workflowSteps[1]!.order).toBe(1);

      // Verify workflow step source/target paths reference agents.
      expect(workflowSteps[0]!.source).toContain('Researcher');
      expect(workflowSteps[0]!.target).toContain('Writer');
      expect(workflowSteps[1]!.source).toContain('Writer');
      expect(workflowSteps[1]!.target).toContain('Editor');

      // team_membership: 2 edges (editor->researcher, editor->writer).
      const teamMembers = connections.filter(c => c.type === 'team_membership');
      expect(teamMembers).toHaveLength(2);

      // In hierarchical mode, source should be the manager (editor).
      for (const tm of teamMembers) {
        expect(tm.source).toContain('Editor');
      }

      // Verify team member roles via dataMapping.
      const teamRoles = teamMembers.map(m => m.dataMapping?.role);
      expect(teamRoles).toContain('researcher');
      expect(teamRoles).toContain('writer');

      // router_route: 3 edges (router->researcher, router->writer, router->editor default).
      const routerRoutes = connections.filter(c => c.type === 'router_route');
      expect(routerRoutes).toHaveLength(3);

      // Verify named routes have conditions.
      const researchRoute = routerRoutes.find(r => r.dataMapping?.routeName === 'research');
      expect(researchRoute).toBeDefined();
      expect(researchRoute!.condition).toBe('intent === "research"');

      const writingRoute = routerRoutes.find(r => r.dataMapping?.routeName === 'writing');
      expect(writingRoute).toBeDefined();
      expect(writingRoute!.condition).toBe('intent === "writing"');

      // Verify default route.
      const defaultRoute = routerRoutes.find(r => r.condition === '__default__');
      expect(defaultRoute).toBeDefined();
      expect(defaultRoute!.target).toContain('Editor');

      // handoff: 1 edge (researcher->editor).
      const handoffs = connections.filter(c => c.type === 'handoff');
      expect(handoffs).toHaveLength(1);
      expect(handoffs[0]!.source).toContain('Researcher');
      expect(handoffs[0]!.target).toContain('Editor');
    });

    it('assembly contains correct composition resource properties', () => {
      const { app, stack, researcher, writer, editor } = createThreeAgentStack();

      new Workflow(stack, 'Pipeline', {
        steps: [
          { agent: researcher, task: 'Research {topic}', name: 'research' },
          { agent: writer, task: 'Write about {research}', name: 'write' },
        ],
      });

      new Team(stack, 'Squad', {
        orchestration: TeamOrchestration.COLLABORATIVE,
        members: [
          { agent: researcher, role: 'researcher', maxConcurrent: 3 },
          { agent: writer, role: 'writer' },
        ],
      });

      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      const assembly = buildResult.stacks['CompositionTest']!;

      // Verify Workflow resource properties.
      const workflowRes = Object.values(assembly.resources).find(
        r => r.type === 'agentforge::composition::Workflow',
      )!;
      expect(workflowRes).toBeDefined();
      expect(workflowRes.properties['errorHandling']).toBe('abort'); // default
      expect(workflowRes.properties['maxRetries']).toBe(1); // default
      const steps = workflowRes.properties['steps'] as Array<Record<string, unknown>>;
      expect(steps).toHaveLength(2);
      expect(steps[0]!['agentName']).toBe('researcher');
      expect(steps[1]!['agentName']).toBe('writer');

      // Verify Team resource properties.
      const teamRes = Object.values(assembly.resources).find(
        r => r.type === 'agentforge::composition::Team',
      )!;
      expect(teamRes).toBeDefined();
      expect(teamRes.properties['orchestration']).toBe('collaborative');
      const members = teamRes.properties['members'] as Array<Record<string, unknown>>;
      expect(members).toHaveLength(2);
      expect(members[0]!['role']).toBe('researcher');
      expect(members[0]!['maxConcurrent']).toBe(3);
      expect(members[1]!['role']).toBe('writer');
    });
  });

  // ─── Compilation ──────────────────────────────────────────────────────

  describe('compile composition assembly with LocalTargetCompiler', () => {
    it('compiles assembly with composition resources successfully', () => {
      const { app, stack, researcher, writer, editor } = createThreeAgentStack();

      // Add all composition constructs.
      new Workflow(stack, 'ContentPipeline', {
        steps: [
          { agent: researcher, task: 'Research the topic', name: 'research' },
          { agent: writer, task: 'Write the article', name: 'write' },
          { agent: editor, task: 'Edit the article', name: 'edit' },
        ],
      });

      new Team(stack, 'ContentTeam', {
        orchestration: TeamOrchestration.HIERARCHICAL,
        manager: editor,
        members: [
          { agent: researcher, role: 'researcher' },
          { agent: writer, role: 'writer' },
        ],
      });

      new Router(stack, 'TaskRouter', {
        strategy: RoutingStrategy.RULE_BASED,
        routes: [
          { name: 'research', description: 'Research tasks', target: researcher },
          { name: 'writing', description: 'Writing tasks', target: writer },
        ],
        defaultRoute: editor,
      });

      new Handoff(stack, 'Escalation', {
        source: researcher,
        target: HandoffTarget.agent(editor),
        triggers: [
          HandoffTrigger.turnCount({ maxTurns: 10 }),
          HandoffTrigger.sentimentThreshold({ score: -0.5 }),
        ],
      });

      // Build assembly.
      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      const assembly = buildResult.stacks['CompositionTest']!;

      // Compile with LocalTargetCompiler.
      const compiler = new LocalTargetCompiler();
      const compileOutDir = join(tempDir, 'compiled-composition');

      // Validate first.
      const validation = compiler.validate(assembly);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Compile.
      const result = compiler.compile(assembly, compileOutDir);

      // Verify compilation produced artifacts.
      expect(result.artifacts.length).toBeGreaterThan(0);
      expect(result.unsupportedResources).toHaveLength(0);

      // Verify output files exist.
      expect(existsSync(join(compileOutDir, 'runtime.ts'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'package.json'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'config.json'))).toBe(true);

      // Verify agent modules were generated for all 3 agents.
      const agentArtifacts = result.artifacts.filter(a => a.path.startsWith('agents/'));
      expect(agentArtifacts.length).toBe(3);

      // Verify each agent module file exists.
      for (const artifact of agentArtifacts) {
        expect(existsSync(join(compileOutDir, artifact.path))).toBe(true);
      }
    });

    it('validation succeeds for assembly with composition resources', () => {
      const { app, stack, researcher, writer, editor } = createThreeAgentStack();

      new Workflow(stack, 'Pipeline', {
        steps: [
          { agent: researcher, task: 'Step 1' },
          { agent: writer, task: 'Step 2' },
        ],
      });

      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      const assembly = buildResult.stacks['CompositionTest']!;

      const compiler = new LocalTargetCompiler();
      const validation = compiler.validate(assembly);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Verify composition resource types are in the supported list.
      const supported = compiler.supportedResourceTypes();
      expect(supported).toContain('agentforge::composition::Workflow');
      expect(supported).toContain('agentforge::composition::Team');
      expect(supported).toContain('agentforge::composition::Router');
      expect(supported).toContain('agentforge::composition::Handoff');
    });
  });

  // ─── Full pipeline ────────────────────────────────────────────────────

  describe('full composition pipeline: build -> compile', () => {
    it('runs a complete multi-agent composition pipeline end-to-end', () => {
      const { app, stack, researcher, writer, editor } = createThreeAgentStack();

      // Build a complete composition system.
      new Workflow(stack, 'ContentPipeline', {
        steps: [
          { agent: researcher, task: 'Research {topic}', name: 'research' },
          { agent: writer, task: 'Write based on {research}', name: 'write' },
          { agent: editor, task: 'Edit and polish {draft}', name: 'edit' },
        ],
        errorHandling: 'retry',
        maxRetries: 3,
      });

      new Team(stack, 'ContentTeam', {
        orchestration: TeamOrchestration.HIERARCHICAL,
        manager: editor,
        members: [
          { agent: researcher, role: 'researcher', maxConcurrent: 2 },
          { agent: writer, role: 'writer' },
        ],
        maxRounds: 5,
      });

      new Router(stack, 'TaskRouter', {
        strategy: RoutingStrategy.RULE_BASED,
        routes: [
          { name: 'research', description: 'Research requests', target: researcher, condition: 'type === "research"' },
          { name: 'writing', description: 'Writing tasks', target: writer, condition: 'type === "writing"' },
        ],
        defaultRoute: editor,
      });

      new Handoff(stack, 'ResearchEscalation', {
        source: researcher,
        target: HandoffTarget.agent(editor),
        triggers: [
          HandoffTrigger.turnCount({ maxTurns: 10 }),
          HandoffTrigger.sentimentThreshold({ score: -0.7 }),
          HandoffTrigger.userRequest(),
        ],
        contextTransfer: { includeFullConversation: true, redactPII: true },
      });

      // Phase 1: Build.
      const buildResult = app.build({ writeOutput: false, throwOnError: true });
      expect(buildResult.validation.valid).toBe(true);

      const assembly = buildResult.stacks['CompositionTest']!;

      // Verify complete resource count: 3 agents + 3 models + 3 prompts + 4 composition = 13.
      const resourceCount = Object.keys(assembly.resources).length;
      expect(resourceCount).toBe(13);

      // Verify complete connection count:
      // - workflow_step: 2 (research->write, write->edit)
      // - team_membership: 2 (editor->researcher, editor->writer)
      // - router_route: 3 (research, writing, default)
      // - handoff: 1 (researcher->editor)
      // Total: 8
      expect(assembly.connections).toHaveLength(8);

      // Verify all 4 connection types are present.
      const connectionTypeSet = new Set(assembly.connections.map(c => c.type));
      expect(connectionTypeSet.has('workflow_step')).toBe(true);
      expect(connectionTypeSet.has('team_membership')).toBe(true);
      expect(connectionTypeSet.has('router_route')).toBe(true);
      expect(connectionTypeSet.has('handoff')).toBe(true);

      // Phase 2: Compile.
      const compiler = new LocalTargetCompiler();
      const compileOutDir = join(tempDir, 'full-composition-compile');

      const validation = compiler.validate(assembly);
      expect(validation.valid).toBe(true);

      const compileResult = compiler.compile(assembly, compileOutDir);
      expect(compileResult.artifacts.length).toBeGreaterThan(0);
      expect(compileResult.unsupportedResources).toHaveLength(0);

      // Verify output structure.
      expect(existsSync(join(compileOutDir, 'runtime.ts'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'package.json'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'config.json'))).toBe(true);
      expect(existsSync(join(compileOutDir, 'agents'))).toBe(true);
    });
  });
});
