import { describe, it, expect } from 'vitest';
import pc from 'picocolors';
import { formatDiff, formatStatus, formatError, banner } from '../output.js';
import type { DiffResult, StateFile } from '@agentforge/state';
import type { AgentForgeDiagnostic } from '@agentforge/constructs';

// ─── banner() ────────────────────────────────────────────────────────────────

describe('banner', () => {
  it('includes "AgentForge" and the version', () => {
    const result = banner();
    expect(result).toContain('AgentForge');
    expect(result).toContain('v0.1.0');
  });

  it('applies bold cyan styling', () => {
    const result = banner();
    expect(result).toBe(pc.bold(pc.cyan('AgentForge v0.1.0')));
  });
});

// ─── formatDiff() ────────────────────────────────────────────────────────────

describe('formatDiff', () => {
  it('renders "no changes" when diff is empty', () => {
    const diff: DiffResult = { added: [], changed: [], removed: [], unchanged: [] };
    const result = formatDiff(diff);
    expect(result).toContain('AgentForge Preview');
    expect(result).toContain('0 to add');
    expect(result).toContain('0 to change');
    expect(result).toContain('0 to destroy');
    expect(result).toContain('No changes. Infrastructure is up-to-date.');
  });

  it('renders additions with green "+" prefix', () => {
    const diff: DiffResult = {
      added: [
        { id: 'MyStack/Researcher', type: 'agentforge::core::Agent', action: 'add', newHash: 'abc' },
        { id: 'MyStack/Claude', type: 'agentforge::core::Model', action: 'add', newHash: 'def' },
      ],
      changed: [],
      removed: [],
      unchanged: [],
    };
    const result = formatDiff(diff);
    expect(result).toContain('2 to add');
    // The "+" symbol should appear in the output for each added resource.
    const lines = result.split('\n');
    const addLines = lines.filter(l => l.includes('+'));
    expect(addLines.length).toBe(2);
    expect(result).toContain('MyStack/Researcher');
    expect(result).toContain('MyStack/Claude');
    expect(result).toContain('agentforge::core::Agent');
    expect(result).toContain('agentforge::core::Model');
  });

  it('renders changes with yellow "~" prefix and "(properties changed)" note', () => {
    const diff: DiffResult = {
      added: [],
      changed: [
        { id: 'MyStack/WebSearch', type: 'agentforge::core::Tool', action: 'change', oldHash: 'old', newHash: 'new' },
      ],
      removed: [],
      unchanged: [],
    };
    const result = formatDiff(diff);
    expect(result).toContain('1 to change');
    expect(result).toContain('~');
    expect(result).toContain('MyStack/WebSearch');
    expect(result).toContain('(properties changed)');
  });

  it('renders removals with red "-" prefix', () => {
    const diff: DiffResult = {
      added: [],
      changed: [],
      removed: [
        { id: 'MyStack/OldTool', type: 'agentforge::core::Tool', action: 'remove', oldHash: 'xyz' },
      ],
      unchanged: [],
    };
    const result = formatDiff(diff);
    expect(result).toContain('1 to destroy');
    expect(result).toContain('-');
    expect(result).toContain('MyStack/OldTool');
  });

  it('renders a mixed diff with adds, changes, and removals', () => {
    const diff: DiffResult = {
      added: [
        { id: 'Stack/NewAgent', type: 'agentforge::core::Agent', action: 'add', newHash: 'h1' },
      ],
      changed: [
        { id: 'Stack/ExistingTool', type: 'agentforge::core::Tool', action: 'change', oldHash: 'h2', newHash: 'h3' },
      ],
      removed: [
        { id: 'Stack/RemovedModel', type: 'agentforge::core::Model', action: 'remove', oldHash: 'h4' },
      ],
      unchanged: ['Stack/Unchanged'],
    };
    const result = formatDiff(diff);
    expect(result).toContain('1 to add');
    expect(result).toContain('1 to change');
    expect(result).toContain('1 to destroy');
    expect(result).toContain('Stack/NewAgent');
    expect(result).toContain('Stack/ExistingTool');
    expect(result).toContain('Stack/RemovedModel');
  });

  it('applies color function to non-zero counts in the summary header', () => {
    const diff: DiffResult = {
      added: [{ id: 'a', type: 'agentforge::core::Agent', action: 'add', newHash: 'x' }],
      changed: [],
      removed: [],
      unchanged: [],
    };
    const result = formatDiff(diff);
    // The "1 to add" should be passed through pc.green().
    expect(result).toContain(pc.green('1 to add'));
    // All summary parts should be present in the output.
    expect(result).toContain('0 to change');
    expect(result).toContain('0 to destroy');
  });

  it('pads resource type to 35 characters for alignment', () => {
    const diff: DiffResult = {
      added: [
        { id: 'S/A', type: 'agentforge::core::Agent', action: 'add', newHash: 'x' },
      ],
      changed: [],
      removed: [],
      unchanged: [],
    };
    const result = formatDiff(diff);
    // The type string "agentforge::core::Agent" (23 chars) should be padded to 35.
    // We verify by checking the raw (uncolored) content contains the padded type.
    const stripped = stripAnsi(result);
    expect(stripped).toContain('agentforge::core::Agent');
    // The type should be followed by spaces then the id.
    const typeAndId = /agentforge::core::Agent\s+S\/A/;
    expect(stripped).toMatch(typeAndId);
  });

  it('snapshot: full empty diff output', () => {
    const diff: DiffResult = { added: [], changed: [], removed: [], unchanged: [] };
    expect(formatDiff(diff)).toMatchSnapshot();
  });

  it('snapshot: mixed diff output', () => {
    const diff: DiffResult = {
      added: [
        { id: 'Stack/Agent1', type: 'agentforge::core::Agent', action: 'add', newHash: 'a1' },
      ],
      changed: [
        { id: 'Stack/Tool1', type: 'agentforge::core::Tool', action: 'change', oldHash: 'b1', newHash: 'b2' },
      ],
      removed: [
        { id: 'Stack/Model1', type: 'agentforge::core::Model', action: 'remove', oldHash: 'c1' },
      ],
      unchanged: [],
    };
    expect(formatDiff(diff)).toMatchSnapshot();
  });
});

// ─── formatStatus() ──────────────────────────────────────────────────────────

describe('formatStatus', () => {
  it('renders "No resources deployed" when state has no resources', () => {
    const state: StateFile = {
      version: 1,
      target: 'local',
      resources: {},
      metadata: { lastBuildAt: '2025-01-01T00:00:00Z', assemblyHash: 'abc' },
    };
    const result = formatStatus(state);
    expect(result).toContain('AgentForge Status');
    expect(result).toContain('target: local');
    expect(result).toContain('No resources deployed.');
  });

  it('renders deployed resources with correct column layout', () => {
    const state: StateFile = {
      version: 1,
      target: 'local',
      resources: {
        'DemoStack/Researcher': {
          type: 'agentforge::core::Agent',
          id: 'DemoStack/Researcher',
          status: 'deployed',
          lastDeployedAt: '2025-06-01T12:00:00Z',
          lastAssemblyHash: 'hash1',
          outputs: {},
        },
      },
      metadata: { lastBuildAt: '2025-06-01T12:00:00Z', assemblyHash: 'abc' },
    };
    const result = formatStatus(state);
    expect(result).toContain('AgentForge Status');
    expect(result).toContain('target: local');
    expect(result).toContain('agentforge::core::Agent');
    expect(result).toContain('DemoStack/Researcher');
    // Should show column headers.
    expect(result).toContain('Type');
    expect(result).toContain('ID');
    expect(result).toContain('Status');
    expect(result).toContain('Last Deployed');
    // Resource count summary.
    expect(result).toContain('1 resource deployed.');
  });

  it('pluralizes "resources" for multiple resources', () => {
    const state: StateFile = {
      version: 1,
      target: 'docker',
      resources: {
        'S/A': {
          type: 'agentforge::core::Agent',
          id: 'S/A',
          status: 'deployed',
          lastDeployedAt: '2025-01-01T00:00:00Z',
          lastAssemblyHash: 'h1',
          outputs: {},
        },
        'S/B': {
          type: 'agentforge::core::Model',
          id: 'S/B',
          status: 'deployed',
          lastDeployedAt: '2025-01-01T00:00:00Z',
          lastAssemblyHash: 'h2',
          outputs: {},
        },
      },
      metadata: { lastBuildAt: '2025-01-01T00:00:00Z', assemblyHash: 'abc' },
    };
    const result = formatStatus(state);
    expect(result).toContain('2 resources deployed.');
  });

  it('renders outputs beneath the resource row', () => {
    const state: StateFile = {
      version: 1,
      target: 'local',
      resources: {
        'S/Agent': {
          type: 'agentforge::core::Agent',
          id: 'S/Agent',
          status: 'deployed',
          lastDeployedAt: '2025-01-01T00:00:00Z',
          lastAssemblyHash: 'h1',
          outputs: {
            endpoint: 'http://localhost:3000/agents/agent',
            apiKey: 'sk-test-123',
          },
        },
      },
      metadata: { lastBuildAt: '2025-01-01T00:00:00Z', assemblyHash: 'abc' },
    };
    const result = formatStatus(state);
    expect(result).toContain('endpoint: http://localhost:3000/agents/agent');
    expect(result).toContain('apiKey: sk-test-123');
  });

  it('colors deployed status green and failed status red', () => {
    const state: StateFile = {
      version: 1,
      target: 'local',
      resources: {
        'S/Good': {
          type: 'agentforge::core::Agent',
          id: 'S/Good',
          status: 'deployed',
          lastDeployedAt: '2025-01-01T00:00:00Z',
          lastAssemblyHash: 'h1',
          outputs: {},
        },
        'S/Bad': {
          type: 'agentforge::core::Tool',
          id: 'S/Bad',
          status: 'failed',
          lastDeployedAt: '2025-01-01T00:00:00Z',
          lastAssemblyHash: 'h2',
          outputs: {},
        },
      },
      metadata: { lastBuildAt: '2025-01-01T00:00:00Z', assemblyHash: 'abc' },
    };
    const result = formatStatus(state);
    // The word "deployed" should be colored green.
    expect(result).toContain(pc.green('deployed'.padEnd(12)));
    // The word "failed" should be colored red.
    expect(result).toContain(pc.red('failed'.padEnd(12)));
  });

  it('snapshot: status with resources and outputs', () => {
    const state: StateFile = {
      version: 1,
      target: 'local',
      resources: {
        'Stack/Agent': {
          type: 'agentforge::core::Agent',
          id: 'Stack/Agent',
          status: 'deployed',
          lastDeployedAt: '2025-06-15T10:30:00Z',
          lastAssemblyHash: 'abc123',
          outputs: { endpoint: 'http://localhost:3000' },
        },
      },
      metadata: { lastBuildAt: '2025-06-15T10:30:00Z', assemblyHash: 'xyz' },
    };
    expect(formatStatus(state)).toMatchSnapshot();
  });
});

// ─── formatError() ───────────────────────────────────────────────────────────

describe('formatError', () => {
  it('formats an error-severity diagnostic', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF001',
      severity: 'error',
      message: "Missing required property 'model' on Agent 'MyStack/MyAgent'.",
      constructPath: 'MyStack/MyAgent',
      propertyPath: 'properties.model',
      suggestedFix: "Add the 'model' property when constructing Agent.",
      docsUrl: 'https://agentforge.dev/docs/errors/AF001',
    };
    const result = formatError(diag);
    expect(result).toContain('Error');
    expect(result).toContain('AF001');
    expect(result).toContain("Missing required property 'model'");
    expect(result).toContain('at MyStack/MyAgent (properties.model)');
    expect(result).toContain("Fix: Add the 'model' property");
    expect(result).toContain('Docs: https://agentforge.dev/docs/errors/AF001');
  });

  it('formats a warning-severity diagnostic', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF201',
      severity: 'warning',
      message: "Target 'local' does not support resource type 'agentforge::core::Webhook'.",
      constructPath: 'Stack/Webhook',
      suggestedFix: "Use a target that supports 'agentforge::core::Webhook'.",
      docsUrl: 'https://agentforge.dev/docs/errors/AF201',
    };
    const result = formatError(diag);
    expect(result).toContain('Warning');
    expect(result).toContain('AF201');
    expect(result).toContain("Target 'local' does not support");
    expect(result).toContain('at Stack/Webhook');
    expect(result).toContain("Fix: Use a target that supports");
    expect(result).toContain('Docs: https://agentforge.dev/docs/errors/AF201');
  });

  it('formats an info-severity diagnostic', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF500',
      severity: 'info',
      message: 'State file migration available.',
      constructPath: 'global',
      suggestedFix: 'Run agentforge migrate to update state.',
      docsUrl: 'https://agentforge.dev/docs/errors/AF500',
    };
    const result = formatError(diag);
    expect(result).toContain('Info');
    expect(result).toContain('AF500');
  });

  it('omits construct path line when constructPath is empty', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF999',
      severity: 'error',
      message: 'General error.',
      constructPath: '',
      suggestedFix: 'Check your configuration.',
      docsUrl: 'https://agentforge.dev/docs/errors/AF999',
    };
    const result = formatError(diag);
    // When constructPath is empty (falsy), the "at ..." line should not appear.
    expect(result).not.toContain('  at ');
  });

  it('includes construct path without property path suffix when propertyPath is undefined', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF001',
      severity: 'error',
      message: 'Missing model.',
      constructPath: 'MyStack/MyAgent',
      suggestedFix: 'Add a model.',
      docsUrl: 'https://agentforge.dev/docs/errors/AF001',
    };
    const result = formatError(diag);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('at MyStack/MyAgent');
    // Should NOT have the "(propertyPath)" suffix.
    expect(stripped).not.toContain('(');
  });

  it('omits suggested fix line when suggestedFix is empty', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF001',
      severity: 'error',
      message: 'Error with no fix.',
      constructPath: 'Stack/X',
      suggestedFix: '',
      docsUrl: 'https://agentforge.dev/docs/errors/AF001',
    };
    const result = formatError(diag);
    expect(result).not.toContain('Fix:');
  });

  it('omits docs line when docsUrl is empty', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF001',
      severity: 'error',
      message: 'Error with no docs.',
      constructPath: 'Stack/X',
      suggestedFix: 'Do something.',
      docsUrl: '',
    };
    const result = formatError(diag);
    expect(result).not.toContain('Docs:');
  });

  it('capitalizes severity label correctly', () => {
    const severities = ['error', 'warning', 'info'] as const;
    const expected = ['Error', 'Warning', 'Info'];

    for (let i = 0; i < severities.length; i++) {
      const diag: AgentForgeDiagnostic = {
        code: `AF00${i}`,
        severity: severities[i]!,
        message: `Test ${severities[i]}.`,
        constructPath: 'S/X',
        suggestedFix: 'Fix it.',
        docsUrl: 'https://example.com',
      };
      const result = stripAnsi(formatError(diag));
      expect(result).toContain(expected[i]!);
    }
  });

  it('snapshot: full error diagnostic', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF001',
      severity: 'error',
      message: "Missing required property 'model' on Agent 'MyStack/MyAgent'.",
      constructPath: 'MyStack/MyAgent',
      propertyPath: 'properties.model',
      suggestedFix: "Add the 'model' property when constructing Agent.",
      docsUrl: 'https://agentforge.dev/docs/errors/AF001',
    };
    expect(formatError(diag)).toMatchSnapshot();
  });

  it('snapshot: warning diagnostic without property path', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF201',
      severity: 'warning',
      message: "Target 'local' does not support 'Webhook'.",
      constructPath: 'Stack/Webhook',
      suggestedFix: 'Use a different target.',
      docsUrl: 'https://agentforge.dev/docs/errors/AF201',
    };
    expect(formatError(diag)).toMatchSnapshot();
  });

  it('snapshot: info diagnostic', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF500',
      severity: 'info',
      message: 'State file version mismatch.',
      constructPath: 'global',
      suggestedFix: 'Run migration.',
      docsUrl: 'https://agentforge.dev/docs/errors/AF500',
    };
    expect(formatError(diag)).toMatchSnapshot();
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip ANSI escape codes from a string for easier assertion matching.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001B\[[0-9;]*m/g, '');
}
