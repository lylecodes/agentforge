/**
 * @module validation
 *
 * Validation framework for AgentForge constructs.
 *
 * Provides property validation, type checking, and secret leak detection.
 * The validation system produces structured {@link AgentForgeDiagnostic}
 * messages with actionable fix suggestions.
 *
 * @see Section 2.10 of the AgentForge roadmap.
 */

import type { AgentForgeDiagnostic } from './errors.js';
import {
  missingPropertyDiagnostic,
  invalidTypeDiagnostic,
  possibleSecretDiagnostic,
} from './errors.js';
import { isSecretRef, isSecretRefJSON } from './secrets.js';

// ─── Validation Result ──────────────────────────────────────────────────────

/**
 * The result of a validation pass.
 */
export interface ValidationResult {
  /** Whether validation passed without errors. */
  readonly valid: boolean;

  /** Error diagnostics (severity: "error"). */
  readonly errors: AgentForgeDiagnostic[];

  /** Warning diagnostics (severity: "warning"). */
  readonly warnings: AgentForgeDiagnostic[];

  /** Informational diagnostics (severity: "info"). */
  readonly infos: AgentForgeDiagnostic[];
}

// ─── IValidatable ───────────────────────────────────────────────────────────

/**
 * Interface for constructs that support validation.
 */
export interface IValidatable {
  /** Run validation and return diagnostics. */
  validate(): AgentForgeDiagnostic[];
}

// ─── Property Validation ────────────────────────────────────────────────────

/**
 * Descriptor for a required property.
 */
export interface PropertyDescriptor {
  /** Property name. */
  readonly name: string;

  /** Expected TypeScript type (for error messages). */
  readonly expectedType: string;

  /** Whether the property is required. */
  readonly required: boolean;

  /**
   * Type predicate: returns `true` if the value is the correct type.
   * If not provided, only presence is checked for required properties.
   */
  readonly typeCheck?: (value: unknown) => boolean;
}

/**
 * Validate properties of a construct against a set of descriptors.
 *
 * @param properties    - The properties object to validate.
 * @param descriptors   - The expected property descriptors.
 * @param constructPath - Construct tree address (for error reporting).
 * @param resourceType  - Human-readable resource type name.
 * @returns An array of diagnostics for any violations found.
 */
export function validate(
  properties: Record<string, unknown>,
  descriptors: PropertyDescriptor[],
  constructPath: string,
  resourceType: string,
): AgentForgeDiagnostic[] {
  const diagnostics: AgentForgeDiagnostic[] = [];

  for (const desc of descriptors) {
    const value = properties[desc.name];

    // Required check
    if (desc.required && (value === undefined || value === null)) {
      diagnostics.push(
        missingPropertyDiagnostic(constructPath, desc.name, resourceType),
      );
      continue;
    }

    // Type check (only if value is present)
    if (value !== undefined && value !== null && desc.typeCheck) {
      if (!desc.typeCheck(value)) {
        const actualType = Array.isArray(value)
          ? 'array'
          : typeof value;
        diagnostics.push(
          invalidTypeDiagnostic(
            constructPath,
            desc.name,
            desc.expectedType,
            actualType,
          ),
        );
      }
    }
  }

  return diagnostics;
}

// ─── Secret Leak Detection ──────────────────────────────────────────────────

/**
 * Patterns that suggest a string is a leaked secret value.
 *
 * Each pattern includes a regex and a human-readable description.
 */
const SECRET_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /^sk-[a-zA-Z0-9]{20,}$/,
    description: 'OpenAI/Stripe-style API key (sk-...)',
  },
  {
    pattern: /^sk-proj-[a-zA-Z0-9]{20,}$/,
    description: 'OpenAI project API key (sk-proj-...)',
  },
  {
    pattern: /^sk-ant-[a-zA-Z0-9]{20,}$/,
    description: 'Anthropic API key (sk-ant-...)',
  },
  {
    pattern: /^AKIA[0-9A-Z]{16}$/,
    description: 'AWS Access Key ID (AKIA...)',
  },
  {
    pattern: /^ghp_[a-zA-Z0-9]{36,}$/,
    description: 'GitHub personal access token (ghp_...)',
  },
  {
    pattern: /^gho_[a-zA-Z0-9]{36,}$/,
    description: 'GitHub OAuth token (gho_...)',
  },
  {
    pattern: /^xoxb-[0-9]{10,}-[a-zA-Z0-9]{20,}$/,
    description: 'Slack bot token (xoxb-...)',
  },
  {
    pattern: /^[A-Za-z0-9+/]{40,}={0,2}$/,
    description: 'High-entropy base64 string (possible encoded secret)',
  },
];

/**
 * Scan a value tree for strings that look like leaked secret values.
 *
 * Recursively walks through objects and arrays, checking string values
 * against known secret patterns. SecretRef instances and serialized
 * SecretRef JSON objects are skipped (they are the correct way to
 * represent secrets).
 *
 * @param value         - The value tree to scan.
 * @param constructPath - Construct tree address (for error reporting).
 * @param currentPath   - Current property path (for recursive tracking).
 * @returns An array of diagnostics for any suspected leaked secrets.
 */
export function validateSecrets(
  value: unknown,
  constructPath: string,
  currentPath: string = 'properties',
): AgentForgeDiagnostic[] {
  const diagnostics: AgentForgeDiagnostic[] = [];

  if (isSecretRef(value) || isSecretRefJSON(value)) {
    // SecretRef is the correct representation — skip
    return diagnostics;
  }

  if (typeof value === 'string') {
    for (const { pattern } of SECRET_PATTERNS) {
      if (pattern.test(value)) {
        diagnostics.push(
          possibleSecretDiagnostic(constructPath, currentPath),
        );
        // One diagnostic per property path is sufficient
        break;
      }
    }
    return diagnostics;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      diagnostics.push(
        ...validateSecrets(value[i], constructPath, `${currentPath}[${i}]`),
      );
    }
    return diagnostics;
  }

  if (typeof value === 'object' && value !== null) {
    for (const [key, val] of Object.entries(value)) {
      diagnostics.push(
        ...validateSecrets(val, constructPath, `${currentPath}.${key}`),
      );
    }
  }

  return diagnostics;
}

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Merge multiple validation results into one.
 */
export function mergeValidationResults(
  ...results: ValidationResult[]
): ValidationResult {
  const errors: AgentForgeDiagnostic[] = [];
  const warnings: AgentForgeDiagnostic[] = [];
  const infos: AgentForgeDiagnostic[] = [];

  for (const result of results) {
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    infos.push(...result.infos);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    infos,
  };
}

/**
 * Create a {@link ValidationResult} from an array of diagnostics.
 */
export function toValidationResult(
  diagnostics: AgentForgeDiagnostic[],
): ValidationResult {
  return {
    valid: diagnostics.filter((d) => d.severity === 'error').length === 0,
    errors: diagnostics.filter((d) => d.severity === 'error'),
    warnings: diagnostics.filter((d) => d.severity === 'warning'),
    infos: diagnostics.filter((d) => d.severity === 'info'),
  };
}
