/**
 * @module mcp-server
 *
 * The MCPServer construct represents a Model Context Protocol server that
 * exposes tools to agents via the MCP stdio transport.
 *
 * Phase 1 supports stdio transport only. Full MCP support (SSE,
 * streamable-http, authentication) is planned for Phase 5.
 *
 * @example
 * ```typescript
 * const mcpServer = new MCPServer(stack, 'FileSystem', {
 *   transport: 'stdio',
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', './workspace'],
 *   tools: ['read_file', 'write_file', 'list_directory'],
 * });
 * ```
 */

import { Construct } from 'constructs';
import {
  AgentResourceBase,
  SecretRef,
} from '@agentforge/constructs';

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for an {@link MCPServer} construct.
 */
export interface MCPServerProps {
  /**
   * Transport protocol. Phase 1 supports `'stdio'` only.
   */
  readonly transport: 'stdio';

  /**
   * Command to start the MCP server process.
   * @example 'npx'
   * @example 'node'
   */
  readonly command: string;

  /**
   * Arguments passed to the command.
   * @example ['-y', '@modelcontextprotocol/server-filesystem', './workspace']
   */
  readonly args?: string[];

  /**
   * Environment variables for the MCP server process.
   * Values can be plain strings or {@link SecretRef} instances for sensitive
   * values like API keys.
   */
  readonly env?: Record<string, string | SecretRef>;

  /**
   * Optional list of tool names to expose from this server.
   * If omitted, all tools advertised by the server are available.
   * Use this to restrict which tools an agent can access.
   */
  readonly tools?: string[];
}

// ─── Resource Type ──────────────────────────────────────────────────────────

/** Assembly resource type for MCPServer constructs. */
const MCP_SERVER_RESOURCE_TYPE = 'agentforge::core::MCPServer';

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * An MCP (Model Context Protocol) server definition.
 *
 * MCPServer constructs represent external tool servers that agents can
 * connect to via the MCP protocol. In Phase 1, only the stdio transport
 * is supported — the server is spawned as a child process.
 *
 * Tools hosted by an MCP server are referenced in {@link Tool} constructs
 * via the `{ mcp: { server, tool } }` handler syntax.
 *
 * The assembly serializes MCPServer as `agentforge::core::MCPServer`.
 */
export class MCPServer extends AgentResourceBase {
  /** Transport protocol (always 'stdio' in Phase 1). */
  public readonly transport: 'stdio';

  /** Command to start the server process. */
  public readonly command: string;

  /** Command arguments. */
  public readonly args?: string[];

  /** Environment variables (may contain SecretRef values). */
  public readonly env?: Record<string, string | SecretRef>;

  /** Optional tool name filter. */
  public readonly tools?: string[];

  constructor(scope: Construct, id: string, props: MCPServerProps) {
    super(scope, id, MCP_SERVER_RESOURCE_TYPE);

    this.transport = props.transport;
    this.command = props.command;
    this.args = props.args;
    this.env = props.env;
    this.tools = props.tools;
  }

  // ─── Serialization ──────────────────────────────────────────────────────

  /**
   * Returns the resolved properties for assembly serialization.
   * @internal
   */
  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      transport: this.transport,
      command: this.command,
    };

    if (this.args !== undefined && this.args.length > 0) {
      props.args = [...this.args];
    }

    if (this.env !== undefined && Object.keys(this.env).length > 0) {
      const resolvedEnv: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(this.env)) {
        if (typeof value === 'string') {
          resolvedEnv[key] = value;
        } else {
          // SecretRef — serialize as a reference, never as a value.
          resolvedEnv[key] = value.toJSON();
        }
      }
      props.env = resolvedEnv;
    }

    if (this.tools !== undefined && this.tools.length > 0) {
      props.tools = [...this.tools];
    }

    return props;
  }
}
