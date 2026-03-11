import { describe, it, expect } from 'vitest';
import { App, Stack } from '@agentforge/constructs';
import { Agent, Model } from '@agentforge/core';
import { Router } from '../router.js';
import { RoutingStrategy } from '../types.js';

function createTestAgent(stack: Stack, name: string): Agent {
  const model = Model.anthropic(stack, `${name}Model`, 'claude-sonnet-4');
  return new Agent(stack, name, {
    name: name.toLowerCase(),
    description: `${name} agent`,
    model,
  });
}

describe('Router', () => {
  it('creates a Router with rule-based strategy', () => {
    const app = new App({ outdir: '/tmp/test-router' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');
    const writer = createTestAgent(stack, 'Writer');

    const router = new Router(stack, 'TaskRouter', {
      strategy: RoutingStrategy.RULE_BASED,
      routes: [
        { name: 'research', description: 'Research requests', target: researcher, condition: "intent == 'research'" },
        { name: 'writing', description: 'Writing tasks', target: writer, condition: "intent == 'writing'" },
      ],
    });

    expect(router.resourceType).toBe('agentforge::composition::Router');
    expect(router.displayName).toBe('TaskRouter');
  });

  it('creates router_route connections in the stack', () => {
    const app = new App({ outdir: '/tmp/test-router' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');
    const writer = createTestAgent(stack, 'Writer');
    const editor = createTestAgent(stack, 'Editor');

    new Router(stack, 'TaskRouter', {
      strategy: RoutingStrategy.LLM_BASED,
      routes: [
        { name: 'research', description: 'Research requests', target: researcher },
        { name: 'writing', description: 'Writing tasks', target: writer },
      ],
      defaultRoute: editor,
    });

    const connections = stack.connections;
    const routes = connections.filter(c => c.type === 'router_route');
    expect(routes).toHaveLength(3); // 2 named routes + 1 default
    expect(routes[0]!.source).toContain('TaskRouter');
    expect(routes[0]!.target).toContain('Researcher');
  });

  it('serializes with routing model for LLM-based strategy', () => {
    const app = new App({ outdir: '/tmp/test-router' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');
    const routingModel = Model.anthropic(stack, 'RoutingModel', 'claude-haiku-3');

    const router = new Router(stack, 'TaskRouter', {
      strategy: RoutingStrategy.LLM_BASED,
      routingModel,
      routes: [
        { name: 'research', description: 'Research requests', target: researcher },
      ],
    });

    const resource = router.toAssemblyResource();
    expect(resource.properties['strategy']).toBe('llm_based');
    expect(resource.properties['routingModel']).toContain('RoutingModel');
  });

  it('validates that at least one route is required', () => {
    const app = new App({ outdir: '/tmp/test-router' });
    const stack = new Stack(app, 'TestStack');

    const router = new Router(stack, 'EmptyRouter', {
      strategy: RoutingStrategy.RULE_BASED,
      routes: [],
    });

    const diagnostics = router.validate();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toBe('AF603');
  });

  it('includes condition in router_route connections', () => {
    const app = new App({ outdir: '/tmp/test-router' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');

    new Router(stack, 'TaskRouter', {
      strategy: RoutingStrategy.RULE_BASED,
      routes: [
        { name: 'research', description: 'Research requests', target: researcher, condition: "intent == 'research'" },
      ],
    });

    const connections = stack.connections;
    const route = connections.find(c => c.type === 'router_route');
    expect(route!.condition).toBe("intent == 'research'");
  });

  it('marks default route with condition __default__', () => {
    const app = new App({ outdir: '/tmp/test-router' });
    const stack = new Stack(app, 'TestStack');
    const researcher = createTestAgent(stack, 'Researcher');
    const fallback = createTestAgent(stack, 'Fallback');

    new Router(stack, 'TaskRouter', {
      strategy: RoutingStrategy.RULE_BASED,
      routes: [
        { name: 'research', description: 'Research', target: researcher },
      ],
      defaultRoute: fallback,
    });

    const connections = stack.connections;
    const defaultRoute = connections.find(c => c.condition === '__default__');
    expect(defaultRoute).toBeDefined();
    expect(defaultRoute!.target).toContain('Fallback');
  });
});
