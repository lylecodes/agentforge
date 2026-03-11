import { describe, it, expect } from 'vitest';
import { App, Stack } from '@agentforge/constructs';
import { Agent, Model } from '@agentforge/core';
import { Team } from '../team.js';
import { TeamOrchestration } from '../types.js';

function createTestAgent(stack: Stack, name: string): Agent {
  const model = Model.anthropic(stack, `${name}Model`, 'claude-sonnet-4');
  return new Agent(stack, name, {
    name: name.toLowerCase(),
    description: `${name} agent`,
    model,
  });
}

describe('Team', () => {
  it('creates a Team with hierarchical orchestration', () => {
    const app = new App({ outdir: '/tmp/test-team' });
    const stack = new Stack(app, 'TestStack');
    const manager = createTestAgent(stack, 'Manager');
    const researcher = createTestAgent(stack, 'Researcher');
    const writer = createTestAgent(stack, 'Writer');

    const team = new Team(stack, 'ContentTeam', {
      orchestration: TeamOrchestration.HIERARCHICAL,
      manager,
      members: [
        { agent: researcher, role: 'researcher' },
        { agent: writer, role: 'writer' },
      ],
    });

    expect(team.resourceType).toBe('agentforge::composition::Team');
    expect(team.displayName).toBe('ContentTeam');
  });

  it('creates team_membership connections in the stack', () => {
    const app = new App({ outdir: '/tmp/test-team' });
    const stack = new Stack(app, 'TestStack');
    const manager = createTestAgent(stack, 'Manager');
    const researcher = createTestAgent(stack, 'Researcher');
    const writer = createTestAgent(stack, 'Writer');

    new Team(stack, 'ContentTeam', {
      orchestration: TeamOrchestration.HIERARCHICAL,
      manager,
      members: [
        { agent: researcher, role: 'researcher' },
        { agent: writer, role: 'writer' },
      ],
    });

    const connections = stack.connections;
    const memberships = connections.filter(c => c.type === 'team_membership');
    expect(memberships).toHaveLength(2);
    // In hierarchical, connections go from manager to members
    expect(memberships[0]!.source).toContain('Manager');
    expect(memberships[0]!.target).toContain('Researcher');
  });

  it('serializes to assembly resource', () => {
    const app = new App({ outdir: '/tmp/test-team' });
    const stack = new Stack(app, 'TestStack');
    const manager = createTestAgent(stack, 'Manager');
    const worker = createTestAgent(stack, 'Worker');

    const team = new Team(stack, 'MyTeam', {
      orchestration: TeamOrchestration.COLLABORATIVE,
      members: [
        { agent: manager, role: 'lead' },
        { agent: worker, role: 'executor' },
      ],
      maxRounds: 5,
    });

    const resource = team.toAssemblyResource();
    expect(resource.type).toBe('agentforge::composition::Team');
    expect(resource.properties['orchestration']).toBe('collaborative');
    expect(resource.properties['maxRounds']).toBe(5);
  });

  it('validates that team has at least one member', () => {
    const app = new App({ outdir: '/tmp/test-team' });
    const stack = new Stack(app, 'TestStack');

    const team = new Team(stack, 'EmptyTeam', {
      orchestration: TeamOrchestration.HIERARCHICAL,
      members: [],
    });

    const diagnostics = team.validate();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toBe('AF602');
  });

  it('validates hierarchical team requires a manager', () => {
    const app = new App({ outdir: '/tmp/test-team' });
    const stack = new Stack(app, 'TestStack');
    const worker = createTestAgent(stack, 'Worker');

    const team = new Team(stack, 'NoManager', {
      orchestration: TeamOrchestration.HIERARCHICAL,
      members: [{ agent: worker, role: 'worker' }],
      // No manager specified for hierarchical
    });

    const diagnostics = team.validate();
    const managerWarning = diagnostics.find(d => d.message.includes('manager'));
    expect(managerWarning).toBeDefined();
  });

  it('creates sequential connections for SEQUENTIAL orchestration', () => {
    const app = new App({ outdir: '/tmp/test-team' });
    const stack = new Stack(app, 'TestStack');
    const a1 = createTestAgent(stack, 'A1');
    const a2 = createTestAgent(stack, 'A2');
    const a3 = createTestAgent(stack, 'A3');

    new Team(stack, 'SeqTeam', {
      orchestration: TeamOrchestration.SEQUENTIAL,
      members: [
        { agent: a1, role: 'first' },
        { agent: a2, role: 'second' },
        { agent: a3, role: 'third' },
      ],
    });

    const connections = stack.connections;
    const memberships = connections.filter(c => c.type === 'team_membership');
    expect(memberships).toHaveLength(3);
    // Sequential: connections should have order
    expect(memberships[0]!.order).toBe(0);
    expect(memberships[1]!.order).toBe(1);
    expect(memberships[2]!.order).toBe(2);
  });
});
