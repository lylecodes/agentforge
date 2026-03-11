import { describe, it, expect } from 'vitest';
import { App, Stack } from '@agentforge/constructs';
import { Agent, Model } from '@agentforge/core';
import { Handoff } from '../handoff.js';
import { HandoffTarget, HandoffTrigger } from '../types.js';

function createTestAgent(stack: Stack, name: string): Agent {
  const model = Model.anthropic(stack, `${name}Model`, 'claude-sonnet-4');
  return new Agent(stack, name, {
    name: name.toLowerCase(),
    description: `${name} agent`,
    model,
  });
}

describe('Handoff', () => {
  it('creates an agent-to-agent handoff', () => {
    const app = new App({ outdir: '/tmp/test-handoff' });
    const stack = new Stack(app, 'TestStack');
    const support = createTestAgent(stack, 'Support');
    const specialist = createTestAgent(stack, 'Specialist');

    const handoff = new Handoff(stack, 'Escalation', {
      source: support,
      target: HandoffTarget.agent(specialist),
      triggers: [
        HandoffTrigger.turnCount({ maxTurns: 5 }),
      ],
    });

    expect(handoff.resourceType).toBe('agentforge::composition::Handoff');
    expect(handoff.displayName).toBe('Escalation');
  });

  it('creates a handoff connection in the stack', () => {
    const app = new App({ outdir: '/tmp/test-handoff' });
    const stack = new Stack(app, 'TestStack');
    const support = createTestAgent(stack, 'Support');
    const specialist = createTestAgent(stack, 'Specialist');

    new Handoff(stack, 'Escalation', {
      source: support,
      target: HandoffTarget.agent(specialist),
      triggers: [HandoffTrigger.sentimentThreshold({ score: -0.7 })],
    });

    const connections = stack.connections;
    const handoffs = connections.filter(c => c.type === 'handoff');
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0]!.source).toContain('Support');
    expect(handoffs[0]!.target).toContain('Specialist');
  });

  it('creates a handoff to human queue', () => {
    const app = new App({ outdir: '/tmp/test-handoff' });
    const stack = new Stack(app, 'TestStack');
    const support = createTestAgent(stack, 'Support');

    const handoff = new Handoff(stack, 'HumanEscalation', {
      source: support,
      target: HandoffTarget.humanQueue('support-queue'),
      triggers: [HandoffTrigger.userRequest()],
    });

    const resource = handoff.toAssemblyResource();
    expect(resource.properties['target']).toEqual({
      type: 'human_queue',
      queueName: 'support-queue',
    });
  });

  it('serializes with context transfer config', () => {
    const app = new App({ outdir: '/tmp/test-handoff' });
    const stack = new Stack(app, 'TestStack');
    const support = createTestAgent(stack, 'Support');
    const specialist = createTestAgent(stack, 'Specialist');

    const handoff = new Handoff(stack, 'Escalation', {
      source: support,
      target: HandoffTarget.agent(specialist),
      triggers: [HandoffTrigger.turnCount({ maxTurns: 10 })],
      contextTransfer: {
        includeFullConversation: true,
        redactPII: true,
      },
    });

    const resource = handoff.toAssemblyResource();
    expect(resource.properties['contextTransfer']).toEqual({
      includeFullConversation: true,
      redactPII: true,
    });
  });

  it('validates that source is required', () => {
    const app = new App({ outdir: '/tmp/test-handoff' });
    const stack = new Stack(app, 'TestStack');
    const specialist = createTestAgent(stack, 'Specialist');

    const handoff = new Handoff(stack, 'BadHandoff', {
      source: undefined as unknown as Agent,
      target: HandoffTarget.agent(specialist),
      triggers: [],
    });

    const diagnostics = handoff.validate();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toBe('AF604');
  });

  it('serializes triggers to assembly properties', () => {
    const app = new App({ outdir: '/tmp/test-handoff' });
    const stack = new Stack(app, 'TestStack');
    const support = createTestAgent(stack, 'Support');
    const specialist = createTestAgent(stack, 'Specialist');

    const handoff = new Handoff(stack, 'Escalation', {
      source: support,
      target: HandoffTarget.agent(specialist),
      triggers: [
        HandoffTrigger.sentimentThreshold({ score: -0.7 }),
        HandoffTrigger.turnCount({ maxTurns: 10 }),
        HandoffTrigger.custom('user.is_vip == true'),
      ],
    });

    const resource = handoff.toAssemblyResource();
    const triggers = resource.properties['triggers'] as Array<Record<string, unknown>>;
    expect(triggers).toHaveLength(3);
    expect(triggers[0]!['type']).toBe('sentiment_threshold');
    expect(triggers[1]!['type']).toBe('turn_count');
    expect(triggers[2]!['type']).toBe('custom');
  });
});
