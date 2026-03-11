import { describe, it, expect } from 'vitest';
import { App, Stack, SecretRef } from '@agentforge/constructs';
import { MCPServer } from '../mcp-server.js';

/**
 * Helper: create a fresh App + Stack for each test.
 */
function createStack(id = 'TestStack') {
  const app = new App();
  const stack = new Stack(app, id);
  return stack;
}

/**
 * Helper: access the protected resolveProperties method.
 */
function resolveProps(server: MCPServer): Record<string, unknown> {
  return (server as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
}

// ─── Construction ────────────────────────────────────────────────────────────

describe('MCPServer', () => {
  describe('construction', () => {
    it('stores transport and command', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });

      expect(server.transport).toBe('stdio');
      expect(server.command).toBe('npx');
    });

    it('stores args when provided', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', './workspace'],
      });

      expect(server.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', './workspace']);
    });

    it('leaves args undefined when not provided', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });

      expect(server.args).toBeUndefined();
    });

    it('stores env vars with plain string values', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'node',
        env: {
          NODE_ENV: 'production',
          DEBUG: 'false',
        },
      });

      expect(server.env).toEqual({
        NODE_ENV: 'production',
        DEBUG: 'false',
      });
    });

    it('stores env vars with SecretRef values', () => {
      const stack = createStack();
      const apiKey = SecretRef.env('MCP_API_KEY');
      const server = new MCPServer(stack, 'External', {
        transport: 'stdio',
        command: 'node',
        env: {
          API_KEY: apiKey,
          BASE_URL: 'https://api.example.com',
        },
      });

      expect(server.env?.API_KEY).toBe(apiKey);
      expect(server.env?.BASE_URL).toBe('https://api.example.com');
    });

    it('stores tool name filter', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        tools: ['read_file', 'write_file', 'list_directory'],
      });

      expect(server.tools).toEqual(['read_file', 'write_file', 'list_directory']);
    });

    it('leaves tools undefined when not provided', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });

      expect(server.tools).toBeUndefined();
    });

    it('sets the resource type to agentforge::core::MCPServer', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });

      expect(server.resourceType).toBe('agentforge::core::MCPServer');
    });
  });

  // ─── Serialization (resolveProperties) ──────────────────────────────────────

  describe('resolveProperties', () => {
    it('includes transport and command', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });

      const props = resolveProps(server);
      expect(props.transport).toBe('stdio');
      expect(props.command).toBe('npx');
    });

    it('includes args when set', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@mcp/server'],
      });

      const props = resolveProps(server);
      expect(props.args).toEqual(['-y', '@mcp/server']);
    });

    it('omits args when empty or not set', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });

      const props = resolveProps(server);
      expect(props).not.toHaveProperty('args');
    });

    it('serializes plain string env vars as-is', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'node',
        env: {
          NODE_ENV: 'production',
        },
      });

      const props = resolveProps(server);
      const env = props.env as Record<string, unknown>;
      expect(env.NODE_ENV).toBe('production');
    });

    it('serializes SecretRef env vars as SecretRef JSON', () => {
      const stack = createStack();
      const apiKey = SecretRef.env('MCP_API_KEY');
      const server = new MCPServer(stack, 'External', {
        transport: 'stdio',
        command: 'node',
        env: {
          API_KEY: apiKey,
        },
      });

      const props = resolveProps(server);
      const env = props.env as Record<string, unknown>;
      expect(env.API_KEY).toEqual({
        __agentforge_secret_ref__: true,
        source: { type: 'env', variableName: 'MCP_API_KEY' },
      });
    });

    it('omits env when not set', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });

      const props = resolveProps(server);
      expect(props).not.toHaveProperty('env');
    });

    it('omits env when the object is empty', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        env: {},
      });

      const props = resolveProps(server);
      expect(props).not.toHaveProperty('env');
    });

    it('includes tools when set', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        tools: ['read_file', 'write_file'],
      });

      const props = resolveProps(server);
      expect(props.tools).toEqual(['read_file', 'write_file']);
    });

    it('omits tools when not set', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });

      const props = resolveProps(server);
      expect(props).not.toHaveProperty('tools');
    });

    it('omits tools when the array is empty', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        tools: [],
      });

      const props = resolveProps(server);
      expect(props).not.toHaveProperty('tools');
    });

    it('matches snapshot for a fully-specified MCP server', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', './workspace'],
        env: {
          NODE_ENV: 'production',
          API_KEY: SecretRef.env('FS_API_KEY'),
        },
        tools: ['read_file', 'write_file', 'list_directory'],
      });

      const props = resolveProps(server);
      expect(props).toMatchSnapshot();
    });
  });

  // ─── Construct tree ─────────────────────────────────────────────────────────

  describe('construct tree', () => {
    it('has the correct node path', () => {
      const stack = createStack();
      const server = new MCPServer(stack, 'MyServer', {
        transport: 'stdio',
        command: 'npx',
      });

      expect(server.node.path).toBe('App/TestStack/MyServer');
    });
  });
});
