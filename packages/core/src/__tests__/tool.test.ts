import { describe, it, expect } from 'vitest';
import { App, Stack, SecretRef } from '@agentforge/constructs';
import { z } from 'zod';
import { Tool } from '../tool.js';
import type { ToolHandler } from '../tool.js';
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
function resolveProps(tool: Tool): Record<string, unknown> {
  return (tool as unknown as { resolveProperties(): Record<string, unknown> }).resolveProperties();
}

// ─── Handler Normalization ───────────────────────────────────────────────────

describe('Tool', () => {
  describe('inline function handler', () => {
    it('normalizes a plain function into an InlineFunctionHandler', () => {
      const stack = createStack();
      const fn = async () => 'result';
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: fn,
      });

      expect(tool.handler.type).toBe('inline');
      expect((tool.handler as { fn: Function }).fn).toBe(fn);
    });

    it('accepts an explicit InlineFunctionHandler', () => {
      const stack = createStack();
      const fn = () => 42;
      const tool = new Tool(stack, 'Calc', {
        name: 'calculate',
        description: 'Do math',
        handler: { type: 'inline', fn },
      });

      expect(tool.handler.type).toBe('inline');
    });

    it('serializes inline handler with extractionPending marker', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: async () => 'result',
      });

      const props = resolveProps(tool);
      expect(props.handler).toEqual({
        type: 'inline',
        extractionPending: true,
      });
    });
  });

  describe('file reference handler', () => {
    it('normalizes file shorthand { file, export } into FileHandler', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'FileSearch', {
        name: 'file_search',
        description: 'Search files',
        handler: { file: './tools/search.ts', export: 'default' },
      });

      expect(tool.handler.type).toBe('file');
      expect((tool.handler as { file: string }).file).toBe('./tools/search.ts');
      expect((tool.handler as { export: string }).export).toBe('default');
    });

    it('accepts an explicit FileHandler with type', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'FileSearch', {
        name: 'file_search',
        description: 'Search files',
        handler: { type: 'file', file: './tools/search.ts', export: 'handler' },
      });

      expect(tool.handler.type).toBe('file');
    });

    it('serializes file handler with file and export', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'FileSearch', {
        name: 'file_search',
        description: 'Search files',
        handler: { file: './tools/search.ts', export: 'default' },
      });

      const props = resolveProps(tool);
      expect(props.handler).toEqual({
        type: 'file',
        file: './tools/search.ts',
        export: 'default',
      });
    });
  });

  describe('MCP reference handler', () => {
    it('normalizes MCP shorthand { mcp: { server, tool } } into MCPHandler', () => {
      const stack = createStack();
      const mcpServer = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
      });
      const tool = new Tool(stack, 'ReadFile', {
        name: 'read_file',
        description: 'Read a file',
        handler: { mcp: { server: mcpServer, tool: 'read_file' } },
      });

      expect(tool.handler.type).toBe('mcp');
      expect((tool.handler as { server: MCPServer }).server).toBe(mcpServer);
      expect((tool.handler as { tool: string }).tool).toBe('read_file');
    });

    it('registers a dependency on the MCP server', () => {
      const stack = createStack();
      const mcpServer = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });
      const tool = new Tool(stack, 'ReadFile', {
        name: 'read_file',
        description: 'Read a file',
        handler: { mcp: { server: mcpServer, tool: 'read_file' } },
      });

      const deps = tool.node.dependencies;
      expect(deps.map((d) => d.node.path)).toContain(mcpServer.node.path);
    });

    it('serializes MCP handler with server path and tool name', () => {
      const stack = createStack();
      const mcpServer = new MCPServer(stack, 'FS', {
        transport: 'stdio',
        command: 'npx',
      });
      const tool = new Tool(stack, 'ReadFile', {
        name: 'read_file',
        description: 'Read a file',
        handler: { mcp: { server: mcpServer, tool: 'read_file' } },
      });

      const props = resolveProps(tool);
      expect(props.handler).toEqual({
        type: 'mcp',
        server: mcpServer.node.path,
        tool: 'read_file',
      });
    });
  });

  describe('builtin handler', () => {
    it('accepts an explicit BuiltinHandler', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'CodeExec', {
        name: 'code_execution',
        description: 'Execute code',
        handler: { type: 'builtin', name: 'code_execution' },
      });

      expect(tool.handler.type).toBe('builtin');
      expect((tool.handler as { name: string }).name).toBe('code_execution');
    });

    it('serializes builtin handler with name', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'CodeExec', {
        name: 'code_execution',
        description: 'Execute code',
        handler: { type: 'builtin', name: 'code_execution' },
      });

      const props = resolveProps(tool);
      expect(props.handler).toEqual({
        type: 'builtin',
        name: 'code_execution',
      });
    });
  });

  describe('invalid handler', () => {
    it('throws on an invalid handler shape', () => {
      const stack = createStack();
      expect(() => {
        new Tool(stack, 'Bad', {
          name: 'bad_tool',
          description: 'Invalid',
          // @ts-expect-error — intentionally passing an invalid handler
          handler: { unknown: true },
        });
      }).toThrow('Invalid tool handler');
    });
  });

  // ─── Construction ──────────────────────────────────────────────────────────

  describe('construction', () => {
    it('stores name and description', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web for information',
        handler: async () => 'result',
      });

      expect(tool.toolName).toBe('web_search');
      expect(tool.description).toBe('Search the web for information');
    });

    it('sets the resource type to agentforge::core::Tool', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: async () => 'result',
      });

      expect(tool.resourceType).toBe('agentforge::core::Tool');
    });
  });

  // ─── Zod Schema Conversion ─────────────────────────────────────────────────

  describe('Zod schema conversion', () => {
    it('stores a Zod inputSchema and converts it for serialization', () => {
      const stack = createStack();
      const inputSchema = z.object({
        query: z.string().describe('Search query'),
        limit: z.number().optional(),
      });

      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: async () => 'result',
        inputSchema,
      });

      expect(tool.inputSchema).toBe(inputSchema);

      const props = resolveProps(tool);
      const resolved = props.inputSchema as Record<string, unknown>;
      expect(resolved).toBeDefined();
      expect(resolved.type).toBe('object');
      expect((resolved.properties as Record<string, unknown>)).toHaveProperty('query');
      expect((resolved.properties as Record<string, unknown>)).toHaveProperty('limit');
    });

    it('stores a Zod outputSchema and converts it for serialization', () => {
      const stack = createStack();
      const outputSchema = z.object({
        results: z.array(z.string()),
        total: z.number(),
      });

      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: async () => 'result',
        outputSchema,
      });

      const props = resolveProps(tool);
      const resolved = props.outputSchema as Record<string, unknown>;
      expect(resolved.type).toBe('object');
      expect((resolved.properties as Record<string, unknown>)).toHaveProperty('results');
      expect((resolved.properties as Record<string, unknown>)).toHaveProperty('total');
    });

    it('passes through raw JSON Schema objects unchanged', () => {
      const stack = createStack();
      const rawSchema = {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      };

      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: async () => 'result',
        inputSchema: rawSchema,
      });

      const props = resolveProps(tool);
      expect(props.inputSchema).toEqual(rawSchema);
    });
  });

  // ─── Serialization ─────────────────────────────────────────────────────────

  describe('resolveProperties', () => {
    it('includes name, description, and handler', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: async () => 'result',
      });

      const props = resolveProps(tool);
      expect(props.name).toBe('web_search');
      expect(props.description).toBe('Search the web');
      expect(props.handler).toBeDefined();
    });

    it('omits schemas when not provided', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: async () => 'result',
      });

      const props = resolveProps(tool);
      expect(props).not.toHaveProperty('inputSchema');
      expect(props).not.toHaveProperty('outputSchema');
    });

    it('matches snapshot for a file handler with Zod schema', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'Search', {
        name: 'web_search',
        description: 'Search the web',
        handler: { file: './tools/search.ts', export: 'default' },
        inputSchema: z.object({
          query: z.string(),
          maxResults: z.number().default(10),
        }),
      });

      const props = resolveProps(tool);
      expect(props).toMatchSnapshot();
    });
  });

  // ─── Construct tree ─────────────────────────────────────────────────────────

  describe('construct tree', () => {
    it('has the correct node path', () => {
      const stack = createStack();
      const tool = new Tool(stack, 'MyTool', {
        name: 'my_tool',
        description: 'A tool',
        handler: async () => 'result',
      });

      expect(tool.node.path).toBe('App/TestStack/MyTool');
    });
  });
});
