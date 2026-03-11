/**
 * @module tool
 *
 * The Tool construct represents a callable capability that an Agent can invoke.
 * Tools support three handler types from day one:
 *
 * 1. **Inline function** — a plain function that gets extracted to an asset file
 *    at build time via AST analysis.
 * 2. **File reference** — an explicit path to a handler module and export name.
 * 3. **MCP reference** — a tool provided by an MCP server.
 *
 * Input and output schemas can be provided as Zod types (auto-converted to
 * JSON Schema for assembly serialization) or as raw JSON Schema objects.
 *
 * @example
 * ```typescript
 * // Inline function handler
 * new Tool(stack, 'Search', {
 *   name: 'web_search',
 *   description: 'Search the web',
 *   handler: async ({ query }: { query: string }) => {
 *     return await fetch(`https://api.search.com?q=${query}`).then(r => r.json());
 *   },
 *   inputSchema: z.object({ query: z.string() }),
 * });
 *
 * // File reference handler
 * new Tool(stack, 'FileSearch', {
 *   name: 'file_search',
 *   description: 'Search files on disk',
 *   handler: { file: './tools/search.ts', export: 'default' },
 * });
 *
 * // MCP tool reference
 * new Tool(stack, 'MCPSearch', {
 *   name: 'mcp_search',
 *   description: 'Search via MCP server',
 *   handler: { mcp: { server: mcpServer, tool: 'search' } },
 * });
 * ```
 */

import { Construct } from 'constructs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodType } from 'zod';
import { AgentResourceBase } from '@agentforge/constructs';
import type { MCPServer } from './mcp-server.js';

// ─── Handler Types ──────────────────────────────────────────────────────────

/**
 * Handler backed by an inline function that will be extracted at build time.
 */
export interface InlineFunctionHandler {
  readonly type: 'inline';
  /** The function to invoke. Extracted to an asset file during build. */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  readonly fn: Function;
}

/**
 * Handler backed by a file on disk.
 */
export interface FileHandler {
  readonly type: 'file';
  /** Path to the handler module (relative to project root). */
  readonly file: string;
  /** Named or default export to use from the module. */
  readonly export: string;
}

/**
 * Handler backed by a tool exposed by an MCP server.
 */
export interface MCPHandler {
  readonly type: 'mcp';
  /** The MCP server construct that hosts this tool. */
  readonly server: MCPServer;
  /** The tool name as registered on the MCP server. */
  readonly tool: string;
}

/**
 * Handler referencing a built-in capability provided by the runtime.
 */
export interface BuiltinHandler {
  readonly type: 'builtin';
  /** Name of the built-in handler. */
  readonly name: string;
}

/**
 * Discriminated union of all handler types.
 */
export type ToolHandler =
  | InlineFunctionHandler
  | FileHandler
  | MCPHandler
  | BuiltinHandler;

// ─── Shorthand Handler Inputs ───────────────────────────────────────────────

/**
 * Shorthand for a file reference handler (omits `type`).
 */
interface FileHandlerShorthand {
  readonly file: string;
  readonly export: string;
}

/**
 * Shorthand for an MCP handler (omits `type`).
 */
interface MCPHandlerShorthand {
  readonly mcp: {
    readonly server: MCPServer;
    readonly tool: string;
  };
}

/**
 * The handler property on {@link ToolProps} accepts several shorthand forms
 * in addition to the fully-typed {@link ToolHandler} discriminated union.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type ToolHandlerInput = ToolHandler | Function | FileHandlerShorthand | MCPHandlerShorthand;

// ─── Schema types ───────────────────────────────────────────────────────────

/**
 * A schema can be either a Zod type (converted to JSON Schema at build time)
 * or a raw JSON Schema object.
 */
export type SchemaInput = ZodType | Record<string, unknown>;

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for a {@link Tool} construct.
 */
export interface ToolProps {
  /** Tool name as exposed to the LLM. */
  readonly name: string;

  /** Human-readable description of what the tool does (shown to the LLM). */
  readonly description: string;

  /**
   * The handler that implements this tool.
   *
   * Accepts several forms:
   * - A plain function (auto-wrapped as {@link InlineFunctionHandler}).
   * - `{ file: string, export: string }` (auto-wrapped as {@link FileHandler}).
   * - `{ mcp: { server, tool } }` (auto-wrapped as {@link MCPHandler}).
   * - A fully-typed {@link ToolHandler} object.
   */
  readonly handler: ToolHandlerInput;

  /**
   * Schema describing the tool's input parameters.
   * Can be a Zod type (auto-converted to JSON Schema) or a raw JSON Schema object.
   */
  readonly inputSchema?: SchemaInput;

  /**
   * Schema describing the tool's output.
   * Can be a Zod type (auto-converted to JSON Schema) or a raw JSON Schema object.
   */
  readonly outputSchema?: SchemaInput;
}

// ─── Resource Type ──────────────────────────────────────────────────────────

/** Assembly resource type for Tool constructs. */
const TOOL_RESOURCE_TYPE = 'agentforge::core::Tool';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true if the value looks like a Zod schema (has a `_def` property).
 */
function isZodType(value: unknown): value is ZodType {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_def' in value
  );
}

/**
 * Type guard for the file-handler shorthand shape.
 */
function isFileHandlerShorthand(value: unknown): value is FileHandlerShorthand {
  return (
    typeof value === 'object' &&
    value !== null &&
    'file' in value &&
    'export' in value &&
    !('type' in value)
  );
}

/**
 * Type guard for the MCP-handler shorthand shape.
 */
function isMCPHandlerShorthand(value: unknown): value is MCPHandlerShorthand {
  return (
    typeof value === 'object' &&
    value !== null &&
    'mcp' in value &&
    !('type' in value)
  );
}

/**
 * Normalize a shorthand handler input into a fully-typed {@link ToolHandler}.
 */
function normalizeHandler(input: ToolHandlerInput): ToolHandler {
  // Already a typed handler
  if (typeof input === 'object' && input !== null && 'type' in input) {
    return input as ToolHandler;
  }

  // Plain function -> InlineFunctionHandler
  if (typeof input === 'function') {
    return { type: 'inline', fn: input };
  }

  // File reference shorthand
  if (isFileHandlerShorthand(input)) {
    return { type: 'file', file: input.file, export: input.export };
  }

  // MCP shorthand
  if (isMCPHandlerShorthand(input)) {
    return { type: 'mcp', server: input.mcp.server, tool: input.mcp.tool };
  }

  // Fallback: treat as inline if it's callable-ish (shouldn't happen with TS)
  throw new Error(
    `Invalid tool handler: expected a function, { file, export }, { mcp: { server, tool } }, ` +
    `or a fully-typed ToolHandler object.`,
  );
}

/**
 * Convert a schema input to a JSON Schema object for serialization.
 */
function resolveSchema(schema: SchemaInput): Record<string, unknown> {
  if (isZodType(schema)) {
    return zodToJsonSchema(schema) as Record<string, unknown>;
  }
  return schema;
}

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * A callable tool that an Agent can invoke.
 *
 * Tools are the primary mechanism for giving agents capabilities beyond
 * text generation. Each tool has a name, description (shown to the LLM),
 * and a handler that implements the actual logic.
 *
 * The assembly serializes Tool as `agentforge::core::Tool`.
 */
export class Tool extends AgentResourceBase {
  /** Tool name as exposed to the LLM. */
  public readonly toolName: string;

  /** Human-readable description. */
  public readonly description: string;

  /** Normalized handler. */
  public readonly handler: ToolHandler;

  /** Input schema (Zod or JSON Schema). */
  public readonly inputSchema?: SchemaInput;

  /** Output schema (Zod or JSON Schema). */
  public readonly outputSchema?: SchemaInput;

  constructor(scope: Construct, id: string, props: ToolProps) {
    super(scope, id, TOOL_RESOURCE_TYPE);

    this.toolName = props.name;
    this.description = props.description;
    this.handler = normalizeHandler(props.handler);
    this.inputSchema = props.inputSchema;
    this.outputSchema = props.outputSchema;

    // If the handler references an MCP server, register a dependency.
    if (this.handler.type === 'mcp') {
      this.node.addDependency(this.handler.server);
    }
  }

  // ─── Serialization ──────────────────────────────────────────────────────

  /**
   * Returns the resolved properties for assembly serialization.
   * @internal
   */
  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      name: this.toolName,
      description: this.description,
      handler: this.serializeHandler(),
    };

    if (this.inputSchema !== undefined) {
      props.inputSchema = resolveSchema(this.inputSchema);
    }
    if (this.outputSchema !== undefined) {
      props.outputSchema = resolveSchema(this.outputSchema);
    }

    return props;
  }

  /**
   * Serialize the handler for inclusion in the assembly.
   * @internal
   */
  private serializeHandler(): Record<string, unknown> {
    switch (this.handler.type) {
      case 'inline':
        // Inline handlers are represented as a marker in the assembly.
        // The build phase's AST extraction pass will rewrite this to a
        // file handler pointing at the extracted asset.
        return {
          type: 'inline',
          // The function source is not serializable to JSON — the build
          // phase extracts it via AST analysis and rewrites this entry.
          extractionPending: true,
        };

      case 'file':
        return {
          type: 'file',
          file: this.handler.file,
          export: this.handler.export,
        };

      case 'mcp':
        return {
          type: 'mcp',
          server: this.handler.server.node.path,
          tool: this.handler.tool,
        };

      case 'builtin':
        return {
          type: 'builtin',
          name: this.handler.name,
        };
    }
  }
}
