import { describe, it, expect } from 'vitest';
import {
  validate,
  validateSecrets,
  mergeValidationResults,
  toValidationResult,
} from '../validation.js';
import type { PropertyDescriptor, ValidationResult } from '../validation.js';
import { SecretRef } from '../secrets.js';
import type { AgentForgeDiagnostic } from '../errors.js';

// ─── validate() — Property Validation ────────────────────────────────────────

describe('validate', () => {
  const constructPath = 'TestStack/TestResource';
  const resourceType = 'TestResource';

  it('returns no diagnostics when all required properties are present', () => {
    const props = { name: 'test', count: 5 };
    const descriptors: PropertyDescriptor[] = [
      { name: 'name', expectedType: 'string', required: true },
      { name: 'count', expectedType: 'number', required: true },
    ];
    const result = validate(props, descriptors, constructPath, resourceType);
    expect(result).toEqual([]);
  });

  it('reports missing required properties', () => {
    const props = {};
    const descriptors: PropertyDescriptor[] = [
      { name: 'name', expectedType: 'string', required: true },
    ];
    const result = validate(props, descriptors, constructPath, resourceType);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe('AF001');
    expect(result[0]!.severity).toBe('error');
    expect(result[0]!.message).toContain("Missing required property 'name'");
    expect(result[0]!.propertyPath).toBe('properties.name');
  });

  it('treats null as missing for required properties', () => {
    const props = { name: null };
    const descriptors: PropertyDescriptor[] = [
      { name: 'name', expectedType: 'string', required: true },
    ];
    const result = validate(props, descriptors, constructPath, resourceType);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe('AF001');
  });

  it('skips validation for optional missing properties', () => {
    const props = {};
    const descriptors: PropertyDescriptor[] = [
      { name: 'optional', expectedType: 'string', required: false },
    ];
    const result = validate(props, descriptors, constructPath, resourceType);
    expect(result).toEqual([]);
  });

  it('reports type check failures', () => {
    const props = { name: 123 };
    const descriptors: PropertyDescriptor[] = [
      {
        name: 'name',
        expectedType: 'string',
        required: true,
        typeCheck: (v) => typeof v === 'string',
      },
    ];
    const result = validate(props, descriptors, constructPath, resourceType);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe('AF002');
    expect(result[0]!.severity).toBe('error');
    expect(result[0]!.message).toContain("expected type 'string'");
    expect(result[0]!.message).toContain("received 'number'");
  });

  it('reports array as actual type for array values', () => {
    const props = { name: [1, 2, 3] };
    const descriptors: PropertyDescriptor[] = [
      {
        name: 'name',
        expectedType: 'string',
        required: true,
        typeCheck: (v) => typeof v === 'string',
      },
    ];
    const result = validate(props, descriptors, constructPath, resourceType);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toContain("received 'array'");
  });

  it('does not run type check on missing optional properties', () => {
    const props = {};
    const descriptors: PropertyDescriptor[] = [
      {
        name: 'optional',
        expectedType: 'string',
        required: false,
        typeCheck: (v) => typeof v === 'string',
      },
    ];
    const result = validate(props, descriptors, constructPath, resourceType);
    expect(result).toEqual([]);
  });

  it('passes when type check succeeds', () => {
    const props = { tags: ['a', 'b'] };
    const descriptors: PropertyDescriptor[] = [
      {
        name: 'tags',
        expectedType: 'string[]',
        required: true,
        typeCheck: (v) => Array.isArray(v),
      },
    ];
    const result = validate(props, descriptors, constructPath, resourceType);
    expect(result).toEqual([]);
  });

  it('accumulates multiple diagnostics', () => {
    const props = { name: 42 };
    const descriptors: PropertyDescriptor[] = [
      {
        name: 'name',
        expectedType: 'string',
        required: true,
        typeCheck: (v) => typeof v === 'string',
      },
      { name: 'description', expectedType: 'string', required: true },
    ];
    const result = validate(props, descriptors, constructPath, resourceType);
    expect(result).toHaveLength(2);
    expect(result[0]!.code).toBe('AF002');
    expect(result[1]!.code).toBe('AF001');
  });
});

// ─── validateSecrets() — Secret Leak Detection ──────────────────────────────

describe('validateSecrets', () => {
  const constructPath = 'TestStack/TestResource';

  describe('OpenAI-style keys (sk-...)', () => {
    it('detects sk- prefixed keys', () => {
      const result = validateSecrets(
        'sk-abcdefghij1234567890abcdefghij',
        constructPath,
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.code).toBe('AF003');
      expect(result[0]!.message).toContain('Possible secret');
    });
  });

  describe('OpenAI project keys (sk-proj-...)', () => {
    it('detects sk-proj- prefixed keys', () => {
      const result = validateSecrets(
        'sk-proj-abcdefghij1234567890abcdefghij',
        constructPath,
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.code).toBe('AF003');
    });
  });

  describe('Anthropic keys (sk-ant-...)', () => {
    it('detects sk-ant- prefixed keys', () => {
      const result = validateSecrets(
        'sk-ant-abcdefghij1234567890abcdefghij',
        constructPath,
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.code).toBe('AF003');
    });
  });

  describe('AWS Access Key IDs (AKIA...)', () => {
    it('detects AKIA prefixed keys', () => {
      const result = validateSecrets(
        'AKIA1234567890ABCDEF',
        constructPath,
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.code).toBe('AF003');
    });
  });

  describe('GitHub tokens (ghp_...)', () => {
    it('detects ghp_ prefixed tokens', () => {
      const result = validateSecrets(
        'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
        constructPath,
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.code).toBe('AF003');
    });
  });

  describe('GitHub OAuth tokens (gho_...)', () => {
    it('detects gho_ prefixed tokens', () => {
      const result = validateSecrets(
        'gho_abcdefghijklmnopqrstuvwxyz1234567890',
        constructPath,
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.code).toBe('AF003');
    });
  });

  describe('Slack bot tokens (xoxb-...)', () => {
    it('detects xoxb- prefixed tokens', () => {
      const result = validateSecrets(
        'xoxb-' + '1234567890-abcdefghijklmnopqrstuvwxyz',
        constructPath,
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.code).toBe('AF003');
    });
  });

  describe('High-entropy base64 strings', () => {
    it('detects long base64 strings', () => {
      const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop==';
      const result = validateSecrets(base64, constructPath);
      expect(result).toHaveLength(1);
      expect(result[0]!.code).toBe('AF003');
    });
  });

  describe('safe strings', () => {
    it('does not flag normal strings', () => {
      expect(validateSecrets('hello world', constructPath)).toEqual([]);
      expect(validateSecrets('my-agent-name', constructPath)).toEqual([]);
      expect(validateSecrets('http://localhost:3000', constructPath)).toEqual([]);
      expect(validateSecrets('', constructPath)).toEqual([]);
    });

    it('does not flag short sk- strings', () => {
      // Less than 20 chars after sk- prefix
      expect(validateSecrets('sk-short', constructPath)).toEqual([]);
    });
  });

  describe('SecretRef bypass', () => {
    it('does not flag SecretRef instances', () => {
      const ref = SecretRef.env('API_KEY');
      const result = validateSecrets(ref, constructPath);
      expect(result).toEqual([]);
    });

    it('does not flag serialized SecretRef JSON', () => {
      const ref = SecretRef.env('API_KEY');
      const json = ref.toJSON();
      const result = validateSecrets(json, constructPath);
      expect(result).toEqual([]);
    });
  });

  describe('nested structure scanning', () => {
    it('scans nested objects', () => {
      const value = {
        config: {
          apiKey: 'sk-abcdefghij1234567890abcdefghij',
        },
      };
      const result = validateSecrets(value, constructPath);
      expect(result).toHaveLength(1);
      expect(result[0]!.propertyPath).toBe('properties.config.apiKey');
    });

    it('scans arrays', () => {
      const value = ['safe', 'sk-abcdefghij1234567890abcdefghij'];
      const result = validateSecrets(value, constructPath);
      expect(result).toHaveLength(1);
      expect(result[0]!.propertyPath).toBe('properties[1]');
    });

    it('scans deeply nested mixed structures', () => {
      const value = {
        items: [
          { key: 'AKIA1234567890ABCDEF' },
        ],
      };
      const result = validateSecrets(value, constructPath);
      expect(result).toHaveLength(1);
      expect(result[0]!.propertyPath).toBe('properties.items[0].key');
    });

    it('emits only one diagnostic per property path', () => {
      // A value that matches multiple patterns should still produce one diagnostic
      const result = validateSecrets(
        'sk-proj-abcdefghij1234567890abcdefghij',
        constructPath,
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('non-string / non-object types', () => {
    it('returns empty for numbers', () => {
      expect(validateSecrets(42, constructPath)).toEqual([]);
    });

    it('returns empty for booleans', () => {
      expect(validateSecrets(true, constructPath)).toEqual([]);
    });

    it('returns empty for null', () => {
      expect(validateSecrets(null, constructPath)).toEqual([]);
    });
  });
});

// ─── mergeValidationResults ──────────────────────────────────────────────────

describe('mergeValidationResults', () => {
  it('merges multiple results into one', () => {
    const r1: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [{ code: 'AF201', severity: 'warning', message: 'w1', constructPath: 'a', suggestedFix: '', docsUrl: '' }],
      infos: [],
    };
    const r2: ValidationResult = {
      valid: false,
      errors: [{ code: 'AF001', severity: 'error', message: 'e1', constructPath: 'b', suggestedFix: '', docsUrl: '' }],
      warnings: [],
      infos: [{ code: 'AF999', severity: 'info', message: 'i1', constructPath: 'c', suggestedFix: '', docsUrl: '' }],
    };
    const merged = mergeValidationResults(r1, r2);
    expect(merged.valid).toBe(false);
    expect(merged.errors).toHaveLength(1);
    expect(merged.warnings).toHaveLength(1);
    expect(merged.infos).toHaveLength(1);
  });

  it('is valid when there are no errors', () => {
    const r1: ValidationResult = { valid: true, errors: [], warnings: [], infos: [] };
    const r2: ValidationResult = { valid: true, errors: [], warnings: [], infos: [] };
    const merged = mergeValidationResults(r1, r2);
    expect(merged.valid).toBe(true);
  });

  it('handles zero inputs', () => {
    const merged = mergeValidationResults();
    expect(merged.valid).toBe(true);
    expect(merged.errors).toEqual([]);
  });
});

// ─── toValidationResult ──────────────────────────────────────────────────────

describe('toValidationResult', () => {
  it('partitions diagnostics by severity', () => {
    const diagnostics: AgentForgeDiagnostic[] = [
      { code: 'AF001', severity: 'error', message: 'e', constructPath: '', suggestedFix: '', docsUrl: '' },
      { code: 'AF201', severity: 'warning', message: 'w', constructPath: '', suggestedFix: '', docsUrl: '' },
      { code: 'AF999', severity: 'info', message: 'i', constructPath: '', suggestedFix: '', docsUrl: '' },
    ];
    const result = toValidationResult(diagnostics);
    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.infos).toHaveLength(1);
    expect(result.valid).toBe(false);
  });

  it('is valid when there are only warnings and infos', () => {
    const diagnostics: AgentForgeDiagnostic[] = [
      { code: 'AF201', severity: 'warning', message: 'w', constructPath: '', suggestedFix: '', docsUrl: '' },
    ];
    const result = toValidationResult(diagnostics);
    expect(result.valid).toBe(true);
  });

  it('handles empty input', () => {
    const result = toValidationResult([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.infos).toEqual([]);
  });
});
