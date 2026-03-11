import { describe, it, expect, beforeEach } from 'vitest';
import {
  Token,
  TokenMap,
  resolveTokens,
  resolveValue,
  isToken,
  isResolvable,
  containsTokens,
  resetTokenCounter,
  TOKEN_REGEX,
} from '../tokens.js';
import { AgentForgeError } from '../errors.js';

beforeEach(() => {
  resetTokenCounter();
});

// ─── Token Creation ──────────────────────────────────────────────────────────

describe('Token', () => {
  it('assigns sequential numeric IDs', () => {
    const t0 = new Token('a', () => 'v0');
    const t1 = new Token('b', () => 'v1');
    const t2 = new Token('c', () => 'v2');
    expect(t0.id).toBe(0);
    expect(t1.id).toBe(1);
    expect(t2.id).toBe(2);
  });

  it('stores displayHint and producerPath', () => {
    const t = new Token('MyAgent.endpoint', () => 'http://localhost', 'Stack/MyAgent');
    expect(t.displayHint).toBe('MyAgent.endpoint');
    expect(t.producerPath).toBe('Stack/MyAgent');
  });

  it('defaults producerPath to empty string', () => {
    const t = new Token('hint', () => 42);
    expect(t.producerPath).toBe('');
  });

  it('encodes to string marker format', () => {
    const t = new Token('MyAgent.endpoint', () => 'value');
    expect(t.toString()).toBe('${Token[0.MyAgent.endpoint]}');
    expect(t.encoded).toBe(t.toString());
  });

  it('resolves the producer function and caches the result', () => {
    let callCount = 0;
    const t = new Token('hint', () => {
      callCount++;
      return 'resolved';
    });
    expect(t.resolve()).toBe('resolved');
    expect(t.resolve()).toBe('resolved');
    expect(callCount).toBe(1);
  });

  it('can resolve to non-string types', () => {
    const t1 = new Token('num', () => 42);
    const t2 = new Token('bool', () => false);
    const t3 = new Token('obj', () => ({ key: 'val' }));
    const t4 = new Token('arr', () => [1, 2, 3]);
    expect(t1.resolve()).toBe(42);
    expect(t2.resolve()).toBe(false);
    expect(t3.resolve()).toEqual({ key: 'val' });
    expect(t4.resolve()).toEqual([1, 2, 3]);
  });

  it('can resolve to null or undefined', () => {
    const tNull = new Token('null', () => null);
    const tUndefined = new Token('undef', () => undefined);
    expect(tNull.resolve()).toBeNull();
    expect(tUndefined.resolve()).toBeUndefined();
  });
});

// ─── resetTokenCounter ───────────────────────────────────────────────────────

describe('resetTokenCounter', () => {
  it('resets the ID counter so new tokens start at 0', () => {
    new Token('a', () => 1);
    new Token('b', () => 2);
    resetTokenCounter();
    const t = new Token('c', () => 3);
    expect(t.id).toBe(0);
  });
});

// ─── TOKEN_REGEX ─────────────────────────────────────────────────────────────

describe('TOKEN_REGEX', () => {
  it('matches a valid token marker', () => {
    const str = '${Token[0.MyAgent.endpoint]}';
    const matches = [...str.matchAll(new RegExp(TOKEN_REGEX.source, TOKEN_REGEX.flags))];
    expect(matches).toHaveLength(1);
    expect(matches[0]![1]).toBe('0');
    expect(matches[0]![2]).toBe('MyAgent.endpoint');
  });

  it('matches multiple tokens in a string', () => {
    const str = 'prefix ${Token[0.a]} middle ${Token[1.b]} suffix';
    const matches = [...str.matchAll(new RegExp(TOKEN_REGEX.source, TOKEN_REGEX.flags))];
    expect(matches).toHaveLength(2);
  });

  it('does not match non-token strings', () => {
    expect(new RegExp(TOKEN_REGEX.source).test('hello world')).toBe(false);
    expect(new RegExp(TOKEN_REGEX.source).test('${notAToken}')).toBe(false);
  });
});

// ─── TokenMap ────────────────────────────────────────────────────────────────

describe('TokenMap', () => {
  it('registers and retrieves tokens by ID', () => {
    const map = new TokenMap();
    const t = new Token('hint', () => 'val');
    map.register(t);
    expect(map.get(t.id)).toBe(t);
    expect(map.size).toBe(1);
  });

  it('returns undefined for unknown IDs', () => {
    const map = new TokenMap();
    expect(map.get(999)).toBeUndefined();
  });

  it('returns all registered tokens', () => {
    const map = new TokenMap();
    const t0 = new Token('a', () => 1);
    const t1 = new Token('b', () => 2);
    map.register(t0);
    map.register(t1);
    expect(map.all()).toEqual([t0, t1]);
  });

  it('clears all tokens', () => {
    const map = new TokenMap();
    map.register(new Token('a', () => 1));
    map.register(new Token('b', () => 2));
    expect(map.size).toBe(2);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.all()).toEqual([]);
  });
});

// ─── resolveValue ────────────────────────────────────────────────────────────

describe('resolveValue', () => {
  it('resolves a Token instance directly', () => {
    const map = new TokenMap();
    const t = new Token('x', () => 'resolved');
    map.register(t);
    expect(resolveValue(t, map)).toBe('resolved');
  });

  it('resolves a single token marker in a string, returning the raw type', () => {
    const map = new TokenMap();
    const t = new Token('num', () => 42);
    map.register(t);
    const result = resolveValue(t.toString(), map);
    expect(result).toBe(42);
  });

  it('resolves embedded tokens in a larger string, stringifying values', () => {
    const map = new TokenMap();
    const t0 = new Token('host', () => 'localhost');
    const t1 = new Token('port', () => 3000);
    map.register(t0);
    map.register(t1);
    const str = `http://${t0.toString()}:${t1.toString()}/api`;
    const result = resolveValue(str, map);
    expect(result).toBe('http://localhost:3000/api');
  });

  it('leaves unregistered token markers unchanged', () => {
    const map = new TokenMap();
    const str = '${Token[99.unknown]}';
    expect(resolveValue(str, map)).toBe(str);
  });

  it('recursively resolves arrays', () => {
    const map = new TokenMap();
    const t = new Token('val', () => 'resolved');
    map.register(t);
    const result = resolveValue(['plain', t.toString()], map);
    expect(result).toEqual(['plain', 'resolved']);
  });

  it('recursively resolves objects', () => {
    const map = new TokenMap();
    const t = new Token('val', () => 'resolved');
    map.register(t);
    const result = resolveValue({ key: t.toString(), other: 42 }, map);
    expect(result).toEqual({ key: 'resolved', other: 42 });
  });

  it('passes through primitives unchanged', () => {
    const map = new TokenMap();
    expect(resolveValue(42, map)).toBe(42);
    expect(resolveValue(true, map)).toBe(true);
    expect(resolveValue(null, map)).toBeNull();
    expect(resolveValue(undefined, map)).toBeUndefined();
  });
});

// ─── resolveTokens (topological sort via Kahn's algorithm) ───────────────────

describe('resolveTokens', () => {
  it('resolves all tokens in the map', () => {
    const map = new TokenMap();
    const t0 = new Token('a', () => 'A');
    const t1 = new Token('b', () => 'B');
    map.register(t0);
    map.register(t1);
    resolveTokens(map);
    expect(t0.resolve()).toBe('A');
    expect(t1.resolve()).toBe('B');
  });

  it('handles an empty token map', () => {
    const map = new TokenMap();
    expect(() => resolveTokens(map)).not.toThrow();
  });

  it('resolves a single token', () => {
    const map = new TokenMap();
    const t = new Token('single', () => 'only');
    map.register(t);
    resolveTokens(map);
    expect(t.resolve()).toBe('only');
  });

  it('resolves many tokens without error', () => {
    const map = new TokenMap();
    const tokens: Token[] = [];
    for (let i = 0; i < 100; i++) {
      const t = new Token(`token_${i}`, () => i);
      map.register(t);
      tokens.push(t);
    }
    resolveTokens(map);
    for (let i = 0; i < 100; i++) {
      expect(tokens[i]!.resolve()).toBe(i);
    }
  });
});

// ─── Type Guards ─────────────────────────────────────────────────────────────

describe('isToken', () => {
  it('returns true for Token instances', () => {
    expect(isToken(new Token('x', () => 1))).toBe(true);
  });

  it('returns false for non-Token values', () => {
    expect(isToken('string')).toBe(false);
    expect(isToken(42)).toBe(false);
    expect(isToken(null)).toBe(false);
    expect(isToken(undefined)).toBe(false);
    expect(isToken({})).toBe(false);
    expect(isToken({ resolve: () => 1 })).toBe(false);
  });
});

describe('isResolvable', () => {
  it('returns true for objects with a resolve() method', () => {
    expect(isResolvable(new Token('x', () => 1))).toBe(true);
    expect(isResolvable({ resolve: () => 42 })).toBe(true);
  });

  it('returns false for non-resolvable values', () => {
    expect(isResolvable('string')).toBe(false);
    expect(isResolvable(null)).toBe(false);
    expect(isResolvable(undefined)).toBe(false);
    expect(isResolvable({ resolve: 'not-a-function' })).toBe(false);
    expect(isResolvable(42)).toBe(false);
  });
});

describe('containsTokens', () => {
  it('returns true when string contains token markers', () => {
    const t = new Token('hint', () => 'val');
    expect(containsTokens(t.toString())).toBe(true);
    expect(containsTokens(`prefix ${t.toString()} suffix`)).toBe(true);
  });

  it('returns false for strings without token markers', () => {
    expect(containsTokens('hello world')).toBe(false);
    expect(containsTokens('')).toBe(false);
    expect(containsTokens('${notAToken}')).toBe(false);
  });
});
