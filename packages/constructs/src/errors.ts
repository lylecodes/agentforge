/**
 * @module errors
 *
 * Error code system for AgentForge.
 *
 * Every error has a unique code (`AF<NNN>`) with ranges assigned to subsystems.
 * Error quality is a first-class feature — every diagnostic includes a human-readable
 * message, the construct path where it occurred, a suggested fix, and a link to
 * documentation.
 *
 * Error code ranges:
 * - AF001–AF099: Construct validation errors
 * - AF100–AF199: Token resolution / build errors
 * - AF200–AF299: Asset management errors
 * - AF300–AF399: Secret validation errors
 * - AF400–AF499: Target compilation errors
 * - AF500–AF599: State management errors
 * - AF600–AF699: Composition validation errors
 *
 * @see Section 2.10 of the AgentForge roadmap.
 */

// ─── Severity ───────────────────────────────────────────────────────────────

/**
 * Severity level of a diagnostic.
 */
export type Severity = 'error' | 'warning' | 'info';

// ─── Diagnostic ─────────────────────────────────────────────────────────────

/**
 * A structured diagnostic message produced during build or compilation.
 *
 * Every diagnostic is actionable: it tells the user what went wrong,
 * where it went wrong, how to fix it, and where to learn more.
 */
export interface AgentForgeDiagnostic {
  /** Unique error code (e.g., "AF001"). */
  readonly code: string;

  /** Severity level. */
  readonly severity: Severity;

  /** Human-readable message describing the issue. */
  readonly message: string;

  /** Construct tree path where the error occurred (e.g., "MyStack/MyAgent"). */
  readonly constructPath: string;

  /** Property path within the construct, if applicable (e.g., "properties.apiKey"). */
  readonly propertyPath?: string;

  /** Actionable suggested fix. */
  readonly suggestedFix: string;

  /** Link to documentation page for this error code. */
  readonly docsUrl: string;
}

// ─── Error Class ────────────────────────────────────────────────────────────

/**
 * An error that wraps an {@link AgentForgeDiagnostic}.
 *
 * Thrown when a diagnostic with severity "error" is encountered and cannot
 * be deferred.
 *
 * @example
 * ```ts
 * throw new AgentForgeError({
 *   code: 'AF001',
 *   severity: 'error',
 *   message: "Missing required property 'model' on Agent 'MyStack/MyAgent'.",
 *   constructPath: 'MyStack/MyAgent',
 *   suggestedFix: "Add a model property: new Agent(stack, 'MyAgent', { model: new Model(...) })",
 *   docsUrl: 'https://agentforge.dev/docs/errors/AF001',
 * });
 * ```
 */
export class AgentForgeError extends Error {
  /** The structured diagnostic that caused this error. */
  public readonly diagnostic: AgentForgeDiagnostic;

  constructor(diagnostic: AgentForgeDiagnostic) {
    const formatted = formatDiagnostic(diagnostic);
    super(formatted);
    this.name = 'AgentForgeError';
    this.diagnostic = diagnostic;
  }
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format a diagnostic into a human-readable multi-line string.
 */
export function formatDiagnostic(diag: AgentForgeDiagnostic): string {
  const lines: string[] = [
    `${diag.code}: ${diag.message}`,
  ];

  if (diag.constructPath) {
    lines.push(`  at ${diag.constructPath}${diag.propertyPath ? ` (${diag.propertyPath})` : ''}`);
  }

  if (diag.suggestedFix) {
    lines.push(`  Fix: ${diag.suggestedFix}`);
  }

  if (diag.docsUrl) {
    lines.push(`  Docs: ${diag.docsUrl}`);
  }

  return lines.join('\n');
}

// ─── Diagnostic Factory Helpers ─────────────────────────────────────────────

/** Base URL for error documentation pages. */
const DOCS_BASE_URL = 'https://agentforge.dev/docs/errors';

/**
 * Build the documentation URL for a given error code.
 */
export function docsUrl(code: string): string {
  return `${DOCS_BASE_URL}/${code}`;
}

/**
 * Create a diagnostic for a missing required property.
 *
 * @param constructPath - Construct tree address (e.g., "MyStack/MyAgent").
 * @param propertyName  - The name of the missing property.
 * @param resourceType  - The resource type (e.g., "Agent").
 */
export function missingPropertyDiagnostic(
  constructPath: string,
  propertyName: string,
  resourceType: string,
): AgentForgeDiagnostic {
  const code = 'AF001';
  return {
    code,
    severity: 'error',
    message: `Missing required property '${propertyName}' on ${resourceType} '${constructPath}'.`,
    constructPath,
    propertyPath: `properties.${propertyName}`,
    suggestedFix: `Add the '${propertyName}' property when constructing ${resourceType}.`,
    docsUrl: docsUrl(code),
  };
}

/**
 * Create a diagnostic for an invalid property type.
 *
 * @param constructPath - Construct tree address.
 * @param propertyName  - The property with the wrong type.
 * @param expectedType  - The expected TypeScript type.
 * @param actualType    - The actual type received.
 */
export function invalidTypeDiagnostic(
  constructPath: string,
  propertyName: string,
  expectedType: string,
  actualType: string,
): AgentForgeDiagnostic {
  const code = 'AF002';
  return {
    code,
    severity: 'error',
    message: `Property '${propertyName}' on '${constructPath}' expected type '${expectedType}' but received '${actualType}'.`,
    constructPath,
    propertyPath: `properties.${propertyName}`,
    suggestedFix: `Change '${propertyName}' to a value of type '${expectedType}'.`,
    docsUrl: docsUrl(code),
  };
}

/**
 * Create a diagnostic for a possible secret value detected in properties.
 */
export function possibleSecretDiagnostic(
  constructPath: string,
  propertyPath: string,
): AgentForgeDiagnostic {
  const code = 'AF003';
  return {
    code,
    severity: 'error',
    message: `Possible secret value detected in '${constructPath}' at property '${propertyPath}'.`,
    constructPath,
    propertyPath,
    suggestedFix: `Use SecretRef.env('MY_SECRET') instead of raw strings.`,
    docsUrl: docsUrl(code),
  };
}

/**
 * Create a diagnostic for a circular token reference.
 */
export function circularTokenDiagnostic(
  constructPath: string,
  cyclePath: string[],
): AgentForgeDiagnostic {
  const code = 'AF005';
  return {
    code,
    severity: 'error',
    message: `Circular token reference detected: ${cyclePath.join(' -> ')}.`,
    constructPath,
    suggestedFix: 'Break the cycle by removing one of the cross-references.',
    docsUrl: docsUrl(code),
  };
}

/**
 * Create a diagnostic for an unresolved token.
 */
export function unresolvedTokenDiagnostic(
  constructPath: string,
  tokenDisplay: string,
  producerPath: string,
): AgentForgeDiagnostic {
  const code = 'AF006';
  return {
    code,
    severity: 'error',
    message: `Unresolved token ${tokenDisplay} in resource '${constructPath}'.`,
    constructPath,
    suggestedFix: `The token was created by '${producerPath}' but could not be resolved. Ensure the producing construct exists and has not been removed or renamed.`,
    docsUrl: docsUrl(code),
  };
}

/**
 * Create a diagnostic for an asset not found.
 */
export function assetNotFoundDiagnostic(
  constructPath: string,
  assetPath: string,
): AgentForgeDiagnostic {
  const code = 'AF101';
  return {
    code,
    severity: 'error',
    message: `Asset not found: '${assetPath}' referenced by '${constructPath}'.`,
    constructPath,
    suggestedFix: 'Create the file or update the path.',
    docsUrl: docsUrl(code),
  };
}

/**
 * Create a diagnostic for an unsupported resource type in a target.
 */
export function unsupportedResourceDiagnostic(
  constructPath: string,
  resourceType: string,
  targetName: string,
): AgentForgeDiagnostic {
  const code = 'AF201';
  return {
    code,
    severity: 'warning',
    message: `Target '${targetName}' does not support resource type '${resourceType}'.`,
    constructPath,
    suggestedFix: `Use a target that supports '${resourceType}', or remove the construct.`,
    docsUrl: docsUrl(code),
  };
}

// ─── Composition Errors (AF600–AF699) ───────────────────────────────────────

/**
 * Workflow step references an invalid agent.
 */
export function invalidWorkflowStepDiagnostic(
  constructPath: string,
  stepIndex: number,
  detail: string,
): AgentForgeDiagnostic {
  const code = 'AF601';
  return {
    code,
    severity: 'error',
    message: `Workflow step ${stepIndex} is invalid: ${detail}`,
    constructPath,
    suggestedFix: 'Ensure every workflow step references a valid Agent construct.',
    docsUrl: docsUrl(code),
  };
}

/**
 * Team has no members.
 */
export function emptyTeamDiagnostic(constructPath: string): AgentForgeDiagnostic {
  const code = 'AF602';
  return {
    code,
    severity: 'error',
    message: 'Team has no members.',
    constructPath,
    suggestedFix: 'Add at least one member to the Team construct.',
    docsUrl: docsUrl(code),
  };
}

/**
 * Router has no routes.
 */
export function emptyRouterDiagnostic(constructPath: string): AgentForgeDiagnostic {
  const code = 'AF603';
  return {
    code,
    severity: 'error',
    message: 'Router has no routes.',
    constructPath,
    suggestedFix: 'Add at least one route to the Router construct.',
    docsUrl: docsUrl(code),
  };
}

/**
 * Handoff missing source or target.
 */
export function invalidHandoffDiagnostic(
  constructPath: string,
  detail: string,
): AgentForgeDiagnostic {
  const code = 'AF604';
  return {
    code,
    severity: 'error',
    message: `Handoff is invalid: ${detail}`,
    constructPath,
    suggestedFix: 'Ensure handoff has both a valid source agent and target.',
    docsUrl: docsUrl(code),
  };
}

/**
 * Schema mismatch between connected agents in a composition.
 */
export function schemaMismatchDiagnostic(
  constructPath: string,
  sourceAgent: string,
  targetAgent: string,
  detail: string,
): AgentForgeDiagnostic {
  const code = 'AF615';
  return {
    code,
    severity: 'warning',
    message: `Schema mismatch between '${sourceAgent}' and '${targetAgent}': ${detail}`,
    constructPath,
    suggestedFix: 'Add a dataMapping to the workflow step, or update agent schemas to be compatible.',
    docsUrl: docsUrl(code),
  };
}
