import { describe, it, expect } from 'vitest';
import { App, Stack } from '@agentforge/constructs';
import { Agent, Model } from '@agentforge/core';
import { Workflow } from '../workflow.js';
import type { WorkflowStep } from '../types.js';

function createTestAgent(stack: Stack, name: string): Agent {
  const model = Model.anthropic(stack, `${name}Model`, 'claude-sonnet-4');
  return new Agent(stack, name, {
    name: name.toLowerCase(),
    description: `${name} agent`,
    model,
  });
}

describe('Workflow', () => {
  it('creates a Workflow with sequential steps', () => {
    const app = new App({ outdir: '/tmp/test-workflow' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');
    const writer = createTestAgent(stack, 'Writer');

    const workflow = new Workflow(stack, 'Pipeline', {
      steps: [
        { agent: researcher, task: 'Research the topic: {topic}' },
        { agent: writer, task: 'Write an article based on: {research_output}' },
      ],
    });

    expect(workflow.resourceType).toBe('agentforge::composition::Workflow');
    expect(workflow.displayName).toBe('Pipeline');
  });

  it('creates workflow_step connections in the stack', () => {
    const app = new App({ outdir: '/tmp/test-workflow' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');
    const writer = createTestAgent(stack, 'Writer');
    const editor = createTestAgent(stack, 'Editor');

    new Workflow(stack, 'Pipeline', {
      steps: [
        { agent: researcher, task: 'Research {topic}' },
        { agent: writer, task: 'Write based on {research_output}' },
        { agent: editor, task: 'Edit {draft}' },
      ],
    });

    const connections = stack.connections;
    const workflowSteps = connections.filter(c => c.type === 'workflow_step');
    expect(workflowSteps).toHaveLength(2); // 2 edges for 3 steps
    expect(workflowSteps[0]!.source).toContain('Researcher');
    expect(workflowSteps[0]!.target).toContain('Writer');
    expect(workflowSteps[0]!.order).toBe(0);
    expect(workflowSteps[1]!.source).toContain('Writer');
    expect(workflowSteps[1]!.target).toContain('Editor');
    expect(workflowSteps[1]!.order).toBe(1);
  });

  it('serializes to assembly resource with correct properties', () => {
    const app = new App({ outdir: '/tmp/test-workflow' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');
    const writer = createTestAgent(stack, 'Writer');

    const workflow = new Workflow(stack, 'Pipeline', {
      steps: [
        { agent: researcher, task: 'Research {topic}' },
        { agent: writer, task: 'Write {draft}' },
      ],
      errorHandling: 'retry',
      maxRetries: 3,
    });

    const resource = workflow.toAssemblyResource();
    expect(resource.type).toBe('agentforge::composition::Workflow');
    expect(resource.properties).toMatchObject({
      steps: expect.arrayContaining([
        expect.objectContaining({ task: 'Research {topic}' }),
      ]),
      errorHandling: 'retry',
      maxRetries: 3,
    });
  });

  it('validates that at least 2 steps are required', () => {
    const app = new App({ outdir: '/tmp/test-workflow' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');

    const workflow = new Workflow(stack, 'Pipeline', {
      steps: [{ agent: researcher, task: 'Research' }],
    });

    const diagnostics = workflow.validate();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toBe('AF601');
  });

  it('supports dataMapping between steps', () => {
    const app = new App({ outdir: '/tmp/test-workflow' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');
    const writer = createTestAgent(stack, 'Writer');

    new Workflow(stack, 'Pipeline', {
      steps: [
        { agent: researcher, task: 'Research {topic}', name: 'research' },
        { agent: writer, task: 'Write based on research' },
      ],
      dataMapping: {
        'research->1': { research_output: 'input_context' },
      },
    });

    const connections = stack.connections;
    const step = connections.find(c => c.type === 'workflow_step');
    expect(step!.dataMapping).toEqual({ research_output: 'input_context' });
  });

  it('defaults errorHandling to abort', () => {
    const app = new App({ outdir: '/tmp/test-workflow' });
    const stack = new Stack(app, 'TestStack');
    const a1 = createTestAgent(stack, 'A1');
    const a2 = createTestAgent(stack, 'A2');

    const workflow = new Workflow(stack, 'Pipeline', {
      steps: [
        { agent: a1, task: 'Step 1' },
        { agent: a2, task: 'Step 2' },
      ],
    });

    const resource = workflow.toAssemblyResource();
    expect(resource.properties['errorHandling']).toBe('abort');
  });
});
