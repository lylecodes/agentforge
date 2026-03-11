/**
 * @module tokens
 *
 * Token system for lazy and cross-reference values.
 *
 * Tokens enable constructs to reference values that are not known until the
 * full construct tree is built. During synthesis, tokens are resolved via
 * topological sort with cycle detection.
 *
 * Token encoding in strings: `${Token[<ID>.<DISPLAY_HINT>]}`
 *
 * @see Section 2.8 of the AgentForge roadmap.
 */

import {
  AgentForgeError,
  circularTokenDiagnostic,
  unresolvedTokenDiagnostic,
} from './errors.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Regex to match encoded token markers in strings.
 *
 * Format: `${Token[<ID>.<DISPLAY_HINT>]}`
 */
export const TOKEN_REGEX = /\$\{Token\[(\d+)\.([^\]]+)\]\}/g;

// ─── Token ID Counter ───────────────────────────────────────────────────────

let nextTokenId = 0;

/** Reset the global token ID counter (for testing). */
export function resetTokenCounter(): void {
  nextTokenId = 0;
}

// ─── IResolvable ────────────────────────────────────────────────────────────

/**
 * Interface for objects that produce a value during synthesis.
 */
export interface IResolvable {
  /** Resolve this value. Called during the token resolution phase. */
  resolve(): unknown;
}

// ─── Token Class ────────────────────────────────────────────────────────────

/**
 * A lazy/cross-reference value that is resolved during the build phase.
 *
 * Tokens are created when one construct needs to reference a value produced
 * by another construct (e.g., Agent A uses Tool B's endpoint). The token
 * acts as a placeholder during tree construction and is resolved to a
 * concrete value during synthesis.
 *
 * @example
 * ```ts
 * // Producer creates a token
 * const endpointToken = new Token('MyAgent.endpoint', () => 'http://localhost:3000');
 *
 * // Consumer uses the token's string encoding
 * const encoded = endpointToken.toString(); // "${Token[0.MyAgent.endpoint]}"
 *
 * // During build, resolve() replaces encodings with values
 * ```
 */
export class Token implements IResolvable {
  /** Unique numeric ID for this token. */
  public readonly id: number;

  /** Human-readable display hint (e.g., "MyAgent.endpoint"). */
  public readonly displayHint: string;

  /** The construct path of the producer (for error reporting). */
  public readonly producerPath: string;

  /** The resolution function. */
  private readonly producer: () => unknown;

  /** Cached resolved value. */
  private resolvedValue: unknown = undefined;

  /** Whether this token has been resolved. */
  private isResolved = false;

  /**
   * @param displayHint  - Human-readable hint for debugging.
   * @param producer     - Function that produces the resolved value.
   * @param producerPath - Construct path of the producing construct.
   */
  constructor(
    displayHint: string,
    producer: () => unknown,
    producerPath: string = '',
  ) {
    this.id = nextTokenId++;
    this.displayHint = displayHint;
    this.producer = producer;
    this.producerPath = producerPath;
  }

  /**
   * Resolve this token by calling its producer function.
   * The result is cached — subsequent calls return the same value.
   */
  resolve(): unknown {
    if (!this.isResolved) {
      this.resolvedValue = this.producer();
      this.isResolved = true;
    }
    return this.resolvedValue;
  }

  /**
   * Encode this token as a string marker.
   *
   * The marker format `${Token[<ID>.<DISPLAY_HINT>]}` is designed to be:
   * 1. Unlikely to appear in normal strings
   * 2. Parseable with a regex
   * 3. Human-readable when inspecting the construct tree
   */
  toString(): string {
    return `\${Token[${this.id}.${this.displayHint}]}`;
  }

  /**
   * Get the encoded string form of this token.
   * Alias for toString().
   */
  get encoded(): string {
    return this.toString();
  }
}

// ─── Token Map ──────────────────────────────────────────────────────────────

/**
 * A registry that tracks all tokens created during construct tree building.
 *
 * Used by the synthesis engine to resolve all tokens in dependency order.
 */
export class TokenMap {
  private readonly tokens = new Map<number, Token>();

  /**
   * Register a token in the map.
   */
  register(token: Token): void {
    this.tokens.set(token.id, token);
  }

  /**
   * Look up a token by its numeric ID.
   */
  get(id: number): Token | undefined {
    return this.tokens.get(id);
  }

  /**
   * Get all registered tokens.
   */
  all(): Token[] {
    return Array.from(this.tokens.values());
  }

  /**
   * Number of registered tokens.
   */
  get size(): number {
    return this.tokens.size;
  }

  /**
   * Clear all registered tokens.
   */
  clear(): void {
    this.tokens.clear();
  }
}

// ─── Token Resolution ───────────────────────────────────────────────────────

/**
 * Dependency edge for topological sort.
 */
interface TokenDependency {
  /** Token that depends on another. */
  consumer: number;
  /** Token that must be resolved first. */
  producer: number;
}

/**
 * Extract token IDs referenced in a string value.
 */
function extractTokenIds(value: string): number[] {
  const ids: number[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(TOKEN_REGEX.source, TOKEN_REGEX.flags);
  while ((match = regex.exec(value)) !== null) {
    ids.push(parseInt(match[1]!, 10));
  }
  return ids;
}

/**
 * Recursively scan a value for token references and return their IDs.
 */
function findTokenReferences(value: unknown): number[] {
  if (typeof value === 'string') {
    return extractTokenIds(value);
  }
  if (value instanceof Token) {
    return [value.id];
  }
  if (Array.isArray(value)) {
    return value.flatMap(findTokenReferences);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(findTokenReferences);
  }
  return [];
}

/**
 * Resolve all tokens in a value, replacing encoded markers with resolved values.
 *
 * For string values, replaces `${Token[<ID>.<HINT>]}` markers with the
 * resolved value. If the entire string is a single token marker, the
 * resolved value is returned directly (preserving non-string types).
 *
 * For objects and arrays, recursively resolves all nested values.
 *
 * @param value    - The value to resolve.
 * @param tokenMap - The token registry.
 * @returns The value with all token markers replaced by resolved values.
 */
export function resolveValue(value: unknown, tokenMap: TokenMap): unknown {
  if (value instanceof Token) {
    return value.resolve();
  }

  if (typeof value === 'string') {
    // Check if the entire string is a single token
    const singleTokenMatch = value.match(/^\$\{Token\[(\d+)\.[^\]]+\]\}$/);
    if (singleTokenMatch) {
      const id = parseInt(singleTokenMatch[1]!, 10);
      const token = tokenMap.get(id);
      if (token) {
        return token.resolve();
      }
    }

    // Replace embedded tokens in a larger string
    return value.replace(TOKEN_REGEX, (_match, idStr: string) => {
      const id = parseInt(idStr, 10);
      const token = tokenMap.get(id);
      if (token) {
        const resolved = token.resolve();
        return String(resolved);
      }
      return _match;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, tokenMap));
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = resolveValue(val, tokenMap);
    }
    return result;
  }

  return value;
}

/**
 * Resolve all tokens in the token map using topological sort.
 *
 * Performs cycle detection and throws {@link AgentForgeError} if circular
 * references are found.
 *
 * @param tokenMap - The token registry containing all tokens to resolve.
 * @throws {AgentForgeError} If circular token references are detected.
 */
export function resolveTokens(tokenMap: TokenMap): void {
  const tokens = tokenMap.all();
  if (tokens.length === 0) return;

  // Build dependency graph
  const deps: TokenDependency[] = [];
  for (const token of tokens) {
    // Check if the token's producer references other tokens
    // We do a trial resolution to discover dependencies
    const producerRefs = findTokenReferencesInProducer(token, tokenMap);
    for (const depId of producerRefs) {
      deps.push({ consumer: token.id, producer: depId });
    }
  }

  // Topological sort with cycle detection (Kahn's algorithm)
  const inDegree = new Map<number, number>();
  const adjacency = new Map<number, number[]>();

  for (const token of tokens) {
    inDegree.set(token.id, 0);
    adjacency.set(token.id, []);
  }

  for (const dep of deps) {
    const current = inDegree.get(dep.consumer) ?? 0;
    inDegree.set(dep.consumer, current + 1);
    const adj = adjacency.get(dep.producer);
    if (adj) {
      adj.push(dep.consumer);
    }
  }

  // Start with tokens that have no dependencies
  const queue: number[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const resolved: number[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    resolved.push(id);

    const token = tokenMap.get(id);
    if (token) {
      token.resolve();
    }

    const dependents = adjacency.get(id) ?? [];
    for (const depId of dependents) {
      const current = inDegree.get(depId)!;
      inDegree.set(depId, current - 1);
      if (current - 1 === 0) {
        queue.push(depId);
      }
    }
  }

  // Check for cycles
  if (resolved.length < tokens.length) {
    const unresolvedIds = tokens
      .filter((t) => !resolved.includes(t.id))
      .map((t) => t.producerPath || t.displayHint);

    throw new AgentForgeError(
      circularTokenDiagnostic(unresolvedIds[0] ?? 'unknown', unresolvedIds),
    );
  }
}

/**
 * Attempt to discover what other tokens a token's producer depends on.
 *
 * This is a best-effort analysis: we cannot introspect the producer function
 * body, but we can check if the producer is known to depend on another token
 * via the token map.
 */
function findTokenReferencesInProducer(
  _token: Token,
  _tokenMap: TokenMap,
): number[] {
  // In a full implementation, this would analyze the producer function's
  // closure or use explicit dependency declarations. For now, tokens that
  // declare dependencies do so through the construct dependency graph,
  // which is handled at the resource level.
  return [];
}

// ─── Type Guards ────────────────────────────────────────────────────────────

/**
 * Type guard: is the value a {@link Token}?
 */
export function isToken(value: unknown): value is Token {
  return value instanceof Token;
}

/**
 * Type guard: does the value implement {@link IResolvable}?
 */
export function isResolvable(value: unknown): value is IResolvable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'resolve' in value &&
    typeof (value as IResolvable).resolve === 'function'
  );
}

/**
 * Check whether a string contains encoded token markers.
 */
export function containsTokens(value: string): boolean {
  return new RegExp(TOKEN_REGEX.source, TOKEN_REGEX.flags).test(value);
}
