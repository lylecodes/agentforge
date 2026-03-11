import { describe, it, expect } from 'vitest';
import { Construct } from 'constructs';
import type { IConstruct } from 'constructs';
import { App } from '../app.js';
import { Stack } from '../stack.js';
import { AgentResourceBase } from '../resource.js';
import { Aspects, applyAspect, applyAspects, ResourceAspect } from '../aspects.js';
import type { IAspect } from '../aspects.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

class TestResource extends AgentResourceBase {
  constructor(scope: Construct, id: string) {
    super(scope, id, 'agentforge::test::Resource');
    this.addProperty('name', id);
  }
}

function createFixture() {
  const app = new App();
  const stack = new Stack(app, 'S');
  return { app, stack };
}

// ─── Aspects.of / add ────────────────────────────────────────────────────────

describe('Aspects.of', () => {
  it('returns the same Aspects instance for the same construct', () => {
    const { stack } = createFixture();
    const a1 = Aspects.of(stack);
    const a2 = Aspects.of(stack);
    expect(a1).toBe(a2);
  });

  it('returns different Aspects instances for different constructs', () => {
    const { stack } = createFixture();
    const child = new Construct(stack, 'Child');
    expect(Aspects.of(stack)).not.toBe(Aspects.of(child));
  });
});

describe('Aspects.add', () => {
  it('adds aspects to a construct', () => {
    const { stack } = createFixture();
    const aspect: IAspect = { visit: () => {} };
    Aspects.of(stack).add(aspect);
    expect(Aspects.of(stack).all).toHaveLength(1);
    expect(Aspects.of(stack).all[0]).toBe(aspect);
  });

  it('supports multiple aspects on the same construct', () => {
    const { stack } = createFixture();
    Aspects.of(stack).add({ visit: () => {} });
    Aspects.of(stack).add({ visit: () => {} });
    expect(Aspects.of(stack).all).toHaveLength(2);
  });
});

// ─── Aspects.invokeAll ───────────────────────────────────────────────────────

describe('Aspects.invokeAll', () => {
  it('visits all constructs in the tree', () => {
    const { app, stack } = createFixture();
    const visited: string[] = [];
    const aspect: IAspect = {
      visit(node: IConstruct) {
        visited.push(node.node.path);
      },
    };
    Aspects.of(app).add(aspect);

    new TestResource(stack, 'R1');
    new TestResource(stack, 'R2');

    Aspects.invokeAll(app);

    // Should visit: App, App/S, App/S/R1, App/S/R2
    expect(visited).toContain('App');
    expect(visited).toContain('App/S');
    expect(visited).toContain('App/S/R1');
    expect(visited).toContain('App/S/R2');
    expect(visited).toHaveLength(4);
  });

  it('inherits aspects from ancestors', () => {
    const { app, stack } = createFixture();
    const visited: string[] = [];
    const ancestorAspect: IAspect = {
      visit(node: IConstruct) {
        visited.push(`ancestor:${node.node.path}`);
      },
    };
    Aspects.of(app).add(ancestorAspect);

    new TestResource(stack, 'R');

    Aspects.invokeAll(app);

    // The ancestor aspect should visit every node including children
    expect(visited).toContain('ancestor:App');
    expect(visited).toContain('ancestor:App/S');
    expect(visited).toContain('ancestor:App/S/R');
  });

  it('applies local aspects in addition to inherited aspects', () => {
    const { app, stack } = createFixture();
    const log: string[] = [];

    Aspects.of(app).add({
      visit: (n) => log.push(`root:${n.node.path}`),
    });
    Aspects.of(stack).add({
      visit: (n) => log.push(`stack:${n.node.path}`),
    });

    new TestResource(stack, 'R');
    Aspects.invokeAll(app);

    // App should only have root aspect
    expect(log.filter((l) => l.startsWith('root:'))).toContain('root:App');
    // stack aspect should not visit App itself
    expect(log.filter((l) => l === 'stack:App')).toHaveLength(0);

    // Stack's children should have both root and stack aspects
    expect(log).toContain('root:App/S/R');
    expect(log).toContain('stack:App/S/R');
  });

  it('works with no aspects registered', () => {
    const { app, stack } = createFixture();
    new TestResource(stack, 'R');
    // Should not throw
    expect(() => Aspects.invokeAll(app)).not.toThrow();
  });
});

// ─── applyAspect / applyAspects convenience functions ────────────────────────

describe('applyAspect', () => {
  it('is equivalent to Aspects.of(scope).add(aspect)', () => {
    const { stack } = createFixture();
    const aspect: IAspect = { visit: () => {} };
    applyAspect(stack, aspect);
    expect(Aspects.of(stack).all).toHaveLength(1);
    expect(Aspects.of(stack).all[0]).toBe(aspect);
  });
});

describe('applyAspects', () => {
  it('adds multiple aspects at once', () => {
    const { stack } = createFixture();
    const a1: IAspect = { visit: () => {} };
    const a2: IAspect = { visit: () => {} };
    applyAspects(stack, [a1, a2]);
    expect(Aspects.of(stack).all).toHaveLength(2);
  });
});

// ─── ResourceAspect (filter by resource type) ────────────────────────────────

describe('ResourceAspect', () => {
  it('only visits AgentResourceBase nodes', () => {
    const { app, stack } = createFixture();
    const visitedResources: string[] = [];

    class TestAspect extends ResourceAspect {
      protected visitResource(resource: IConstruct): void {
        visitedResources.push(resource.node.path);
      }
    }

    applyAspect(app, new TestAspect());
    new TestResource(stack, 'R1');
    new Construct(stack, 'Plain'); // Not a resource
    new TestResource(stack, 'R2');

    Aspects.invokeAll(app);

    // Only resource nodes should be visited
    expect(visitedResources).toContain('App/S/R1');
    expect(visitedResources).toContain('App/S/R2');
    expect(visitedResources).not.toContain('App/S/Plain');
    expect(visitedResources).not.toContain('App/S');
    expect(visitedResources).not.toContain('App');
  });

  it('can mutate resources', () => {
    const { app, stack } = createFixture();

    class MetadataAspect extends ResourceAspect {
      protected visitResource(resource: IConstruct): void {
        (resource as AgentResourceBase).addMetadata('tagged', true);
      }
    }

    applyAspect(app, new MetadataAspect());
    const r = new TestResource(stack, 'R');

    Aspects.invokeAll(app);

    expect(r.metadata).toEqual({ tagged: true });
  });
});
