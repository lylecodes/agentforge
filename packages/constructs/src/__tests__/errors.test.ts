import { describe, it, expect } from 'vitest';
import {
  AgentForgeError,
  formatDiagnostic,
  docsUrl,
  missingPropertyDiagnostic,
  invalidTypeDiagnostic,
  possibleSecretDiagnostic,
  circularTokenDiagnostic,
  unresolvedTokenDiagnostic,
  assetNotFoundDiagnostic,
  unsupportedResourceDiagnostic,
} from '../errors.js';
import type { AgentForgeDiagnostic } from '../errors.js';

// ─── AgentForgeError ─────────────────────────────────────────────────────────

describe('AgentForgeError', () => {
  it('extends Error with name "AgentForgeError"', () => {
    const diag = missingPropertyDiagnostic('Stack/Agent', 'name', 'Agent');
    const err = new AgentForgeError(diag);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AgentForgeError');
  });

  it('stores the diagnostic', () => {
    const diag = missingPropertyDiagnostic('Stack/Agent', 'name', 'Agent');
    const err = new AgentForgeError(diag);
    expect(err.diagnostic).toBe(diag);
    expect(err.diagnostic.code).toBe('AF001');
  });

  it('formats the diagnostic as the error message', () => {
    const diag = missingPropertyDiagnostic('Stack/Agent', 'name', 'Agent');
    const err = new AgentForgeError(diag);
    expect(err.message).toBe(formatDiagnostic(diag));
    expect(err.message).toContain('AF001');
    expect(err.message).toContain('Stack/Agent');
  });
});

// ─── formatDiagnostic ────────────────────────────────────────────────────────

describe('formatDiagnostic', () => {
  it('formats a diagnostic with all fields', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF001',
      severity: 'error',
      message: 'Test message.',
      constructPath: 'Stack/Agent',
      propertyPath: 'properties.name',
      suggestedFix: 'Fix this.',
      docsUrl: 'https://example.com',
    };
    const formatted = formatDiagnostic(diag);
    expect(formatted).toContain('AF001: Test message.');
    expect(formatted).toContain('at Stack/Agent (properties.name)');
    expect(formatted).toContain('Fix: Fix this.');
    expect(formatted).toContain('Docs: https://example.com');
  });

  it('omits propertyPath when not provided', () => {
    const diag: AgentForgeDiagnostic = {
      code: 'AF005',
      severity: 'error',
      message: 'Circular ref.',
      constructPath: 'Stack/Agent',
      suggestedFix: 'Break cycle.',
      docsUrl: 'https://example.com',
    };
    const formatted = formatDiagnostic(diag);
    expect(formatted).toContain('at Stack/Agent');
    expect(formatted).not.toContain('(');
  });
});

// ─── docsUrl ─────────────────────────────────────────────────────────────────

describe('docsUrl', () => {
  it('generates the correct docs URL for a given code', () => {
    expect(docsUrl('AF001')).toBe('https://agentforge.dev/docs/errors/AF001');
    expect(docsUrl('AF101')).toBe('https://agentforge.dev/docs/errors/AF101');
  });
});

// ─── Diagnostic Factories ────────────────────────────────────────────────────

describe('missingPropertyDiagnostic', () => {
  it('creates a diagnostic with code AF001', () => {
    const d = missingPropertyDiagnostic('Stack/Agent', 'name', 'Agent');
    expect(d.code).toBe('AF001');
    expect(d.severity).toBe('error');
    expect(d.message).toContain("Missing required property 'name'");
    expect(d.message).toContain("Agent");
    expect(d.message).toContain("Stack/Agent");
    expect(d.constructPath).toBe('Stack/Agent');
    expect(d.propertyPath).toBe('properties.name');
    expect(d.suggestedFix).toContain("'name'");
    expect(d.docsUrl).toContain('AF001');
  });
});

describe('invalidTypeDiagnostic', () => {
  it('creates a diagnostic with code AF002', () => {
    const d = invalidTypeDiagnostic('Stack/Agent', 'count', 'number', 'string');
    expect(d.code).toBe('AF002');
    expect(d.severity).toBe('error');
    expect(d.message).toContain("expected type 'number'");
    expect(d.message).toContain("received 'string'");
    expect(d.constructPath).toBe('Stack/Agent');
    expect(d.propertyPath).toBe('properties.count');
    expect(d.docsUrl).toContain('AF002');
  });
});

describe('possibleSecretDiagnostic', () => {
  it('creates a diagnostic with code AF003', () => {
    const d = possibleSecretDiagnostic('Stack/Agent', 'properties.apiKey');
    expect(d.code).toBe('AF003');
    expect(d.severity).toBe('error');
    expect(d.message).toContain('Possible secret value');
    expect(d.constructPath).toBe('Stack/Agent');
    expect(d.propertyPath).toBe('properties.apiKey');
    expect(d.suggestedFix).toContain('SecretRef.env');
    expect(d.docsUrl).toContain('AF003');
  });
});

describe('circularTokenDiagnostic', () => {
  it('creates a diagnostic with code AF005', () => {
    const d = circularTokenDiagnostic('Stack/A', ['Stack/A', 'Stack/B', 'Stack/A']);
    expect(d.code).toBe('AF005');
    expect(d.severity).toBe('error');
    expect(d.message).toContain('Circular token reference');
    expect(d.message).toContain('Stack/A -> Stack/B -> Stack/A');
    expect(d.docsUrl).toContain('AF005');
  });
});

describe('unresolvedTokenDiagnostic', () => {
  it('creates a diagnostic with code AF006', () => {
    const d = unresolvedTokenDiagnostic('Stack/Consumer', 'endpoint', 'Stack/Producer');
    expect(d.code).toBe('AF006');
    expect(d.severity).toBe('error');
    expect(d.message).toContain('Unresolved token');
    expect(d.message).toContain('endpoint');
    expect(d.suggestedFix).toContain('Stack/Producer');
    expect(d.docsUrl).toContain('AF006');
  });
});

describe('assetNotFoundDiagnostic', () => {
  it('creates a diagnostic with code AF101', () => {
    const d = assetNotFoundDiagnostic('Stack/Prompt', './missing.md');
    expect(d.code).toBe('AF101');
    expect(d.severity).toBe('error');
    expect(d.message).toContain('./missing.md');
    expect(d.message).toContain('Stack/Prompt');
    expect(d.docsUrl).toContain('AF101');
  });
});

describe('unsupportedResourceDiagnostic', () => {
  it('creates a diagnostic with code AF201 (warning)', () => {
    const d = unsupportedResourceDiagnostic('Stack/Agent', 'agentforge::core::Agent', 'docker');
    expect(d.code).toBe('AF201');
    expect(d.severity).toBe('warning');
    expect(d.message).toContain('docker');
    expect(d.message).toContain('agentforge::core::Agent');
    expect(d.docsUrl).toContain('AF201');
  });
});
