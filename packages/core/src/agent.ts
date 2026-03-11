/**
 * @module agent
 *
 * The Agent construct is the central resource in AgentForge. It ties together
 * a Model, Tools, Prompt, and MCP servers into a single deployable unit.
 *
 * @example
 * ```typescript
 * const agent = new Agent(stack, 'Researcher', {
 *   name: 'ResearchAssistant',
 *   description: 'Assists with research tasks',
 *   model: new Model(stack, 'Claude', {
 *     provider: 'anthropic',
 *     modelId: 'claude-sonnet-4',
 *   }),
 *   tools: [searchTool, writeTool],
 *   prompt: new Prompt(stack, 'SystemPrompt', {
 *     content: 'You are a helpful research assistant.',
 *   }),
 * });
 * ```
 */

import { Construct } from 'constructs';
import { AgentResourceBase } from '@agentforge/constructs';
import { Model } from './model.js';
import { Tool } from './tool.js';
import { Prompt } from './prompt.js';
import type { MCPServer } from './mcp-server.js';
import type { Memory } from './memory.js';
import type { Schema } from './schema.js';

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for an {@link Agent} construct.
 */
export interface AgentProps {
  /** Human-readable agent name (used in protocols and display). */
  readonly name: string;

  /** Description of the agent's purpose and capabilities. */
  readonly description?: string;

  /** The LLM model this agent uses for inference. */
  readonly model: Model;

  /** Tools available to this agent. */
  readonly tools?: Tool[];

  /**
   * The system prompt for this agent.
   *
   * If a plain string is provided, a child {@link Prompt} construct is
   * automatically created with role `'system'`.
   */
  readonly prompt?: Prompt | string;

  /** MCP servers this agent connects to. */
  readonly mcpServers?: MCPServer[];

  /** Memory backend for persisting conversational context. */
  readonly memory?: Memory;

  /** Schema defining the expected output structure. */
  readonly outputSchema?: Schema;

  /** Schema defining the expected input structure. */
  readonly inputSchema?: Schema;

  /** Arbitrary configuration overrides passed through to the runtime. */
  readonly config?: Record<string, unknown>;
}

// ─── Resource Type ──────────────────────────────────────────────────────────

/** Assembly resource type for Agent constructs. */
const AGENT_RESOURCE_TYPE = 'agentforge::core::Agent';

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * An AI agent — the central construct in AgentForge.
 *
 * Agents bind together a model, tools, a prompt, and MCP servers into a
 * single deployable unit. The assembly serializes Agent as
 * `agentforge::core::Agent` with dependency IDs referencing its
 * constituent resources.
 */
export class Agent extends AgentResourceBase {
  /** Human-readable agent name. */
  public readonly agentName: string;

  /** Agent description. */
  public readonly description?: string;

  /** The LLM model. */
  public readonly model: Model;

  /** Mutable list of tools. Use {@link addTool} to append at runtime. */
  private readonly _tools: Tool[];

  /** The resolved prompt construct. */
  public readonly prompt?: Prompt;

  /** Mutable list of MCP servers. Use {@link addMCPServer} to append. */
  private readonly _mcpServers: MCPServer[];

  /** Optional memory backend. Use {@link addMemory} to set after construction. */
  private _memory?: Memory;

  /** Optional output schema. Use {@link setOutputSchema} to set after construction. */
  private _outputSchema?: Schema;

  /** Optional input schema. Use {@link setInputSchema} to set after construction. */
  private _inputSchema?: Schema;

  /** Runtime configuration overrides. */
  public readonly config?: Record<string, unknown>;

  constructor(scope: Construct, id: string, props: AgentProps) {
    super(scope, id, AGENT_RESOURCE_TYPE);

    this.agentName = props.name;
    this.description = props.description;
    this.model = props.model;
    this._tools = [...(props.tools ?? [])];
    this._mcpServers = [...(props.mcpServers ?? [])];
    this._memory = props.memory;
    this._outputSchema = props.outputSchema;
    this._inputSchema = props.inputSchema;
    this.config = props.config;

    // Auto-create a Prompt child construct if a plain string was provided.
    if (typeof props.prompt === 'string') {
      this.prompt = new Prompt(this, 'Prompt', {
        content: props.prompt,
        role: 'system',
      });
    } else {
      this.prompt = props.prompt;
    }

    // Register dependency edges.
    this.node.addDependency(this.model);
    for (const tool of this._tools) {
      this.node.addDependency(tool);
    }
    if (this.prompt && !(typeof props.prompt === 'string')) {
      // Only add dependency if the Prompt is external (not a child).
      this.node.addDependency(this.prompt);
    }
    for (const server of this._mcpServers) {
      this.node.addDependency(server);
    }
    if (this._memory) {
      this.node.addDependency(this._memory);
    }
    if (this._outputSchema) {
      this.node.addDependency(this._outputSchema);
    }
    if (this._inputSchema) {
      this.node.addDependency(this._inputSchema);
    }
  }

  // ─── Public Accessors ───────────────────────────────────────────────────

  /** The tools currently bound to this agent. */
  get tools(): readonly Tool[] {
    return this._tools;
  }

  /** The MCP servers currently bound to this agent. */
  get mcpServers(): readonly MCPServer[] {
    return this._mcpServers;
  }

  /** The memory backend, if configured. */
  get memory(): Memory | undefined {
    return this._memory;
  }

  /** The output schema, if configured. */
  get outputSchema(): Schema | undefined {
    return this._outputSchema;
  }

  /** The input schema, if configured. */
  get inputSchema(): Schema | undefined {
    return this._inputSchema;
  }

  // ─── Mutation Methods ───────────────────────────────────────────────────

  /**
   * Attach a memory backend to this agent.
   *
   * @param memory - The memory construct to attach.
   */
  addMemory(memory: Memory): void {
    this._memory = memory;
    this.node.addDependency(memory);
  }

  /**
   * Set the output schema for this agent.
   *
   * @param schema - The schema construct defining the output structure.
   */
  setOutputSchema(schema: Schema): void {
    this._outputSchema = schema;
    this.node.addDependency(schema);
  }

  /**
   * Set the input schema for this agent.
   *
   * @param schema - The schema construct defining the input structure.
   */
  setInputSchema(schema: Schema): void {
    this._inputSchema = schema;
    this.node.addDependency(schema);
  }

  /**
   * Add a tool to this agent after construction.
   *
   * @param tool - The tool construct to add.
   */
  addTool(tool: Tool): void {
    this._tools.push(tool);
    this.node.addDependency(tool);
  }

  /**
   * Add an MCP server to this agent after construction.
   *
   * @param server - The MCP server construct to add.
   */
  addMCPServer(server: MCPServer): void {
    this._mcpServers.push(server);
    this.node.addDependency(server);
  }

  // ─── Serialization ──────────────────────────────────────────────────────

  /**
   * Returns the resolved properties for assembly serialization.
   * @internal
   */
  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      name: this.agentName,
      model: this.model.node.path,
    };

    if (this.description !== undefined) {
      props.description = this.description;
    }

    if (this._tools.length > 0) {
      props.tools = this._tools.map((t) => t.node.path);
    }

    if (this.prompt !== undefined) {
      props.prompt = this.prompt.node.path;
    }

    if (this._mcpServers.length > 0) {
      props.mcpServers = this._mcpServers.map((s) => s.node.path);
    }

    if (this._memory !== undefined) {
      props.memory = this._memory.node.path;
    }

    if (this._outputSchema !== undefined) {
      props.outputSchema = this._outputSchema.node.path;
    }

    if (this._inputSchema !== undefined) {
      props.inputSchema = this._inputSchema.node.path;
    }

    if (this.config !== undefined && Object.keys(this.config).length > 0) {
      props.config = { ...this.config };
    }

    return props;
  }
}
