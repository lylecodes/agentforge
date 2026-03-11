/**
 * @module define-agent
 *
 * The Tier 1 "lite" API — one function, zero construct knowledge.
 *
 * `defineAgent()` is the simplest way to define an agent in AgentForge.
 * It creates an entire construct tree (App, Stack, Agent, Model, Tools,
 * Prompt) from a single options object. The returned App can be used
 * directly by the CLI or exported as the default module export.
 *
 * @example
 * ```typescript
 * import { defineAgent } from '@agentforge/core';
 *
 * export default defineAgent({
 *   name: 'researcher',
 *   model: 'anthropic/claude-sonnet-4',
 *   prompt: 'You are a research assistant.',
 *   tools: [
 *     {
 *       name: 'web_search',
 *       description: 'Search the web',
 *       handler: async ({ query }: { query: string }) => {
 *         return await fetch(`https://api.search.com?q=${query}`).then(r => r.json());
 *       },
 *     },
 *   ],
 * });
 * ```
 */

import {
  App,
  Stack,
  SecretRef,
} from '@agentforge/constructs';
import { Model, type ModelProps } from './model.js';
import { Tool, type ToolProps } from './tool.js';
import { Prompt } from './prompt.js';
import { MCPServer, type MCPServerProps } from './mcp-server.js';
import { Memory, type MemoryProps } from './memory.js';
import { Agent } from './agent.js';

// ─── Shorthand tool definition ──────────────────────────────────────────────

/**
 * Shorthand tool definition for the `defineAgent()` API.
 * Accepts either full {@link ToolProps} or an inline-friendly shape.
 */
export type DefineAgentToolInput = ToolProps | {
  /** Tool name. */
  readonly name: string;
  /** Tool description. */
  readonly description: string;
  /** Inline handler function. */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  readonly handler: Function;
};

// ─── Options ────────────────────────────────────────────────────────────────

/**
 * Options for the {@link defineAgent} function.
 */
export interface DefineAgentOptions {
  /**
   * Agent name (used for display and protocol artifacts).
   */
  readonly name: string;

  /**
   * Model specification.
   *
   * Accepts two forms:
   * - **Shorthand string** `'provider/model-id'` (e.g., `'anthropic/claude-sonnet-4'`).
   *   The provider is extracted and the default API key env var is used.
   * - **Full {@link ModelProps}** object for complete control.
   */
  readonly model: string | ModelProps;

  /**
   * System prompt text.
   */
  readonly prompt: string;

  /**
   * Optional agent description.
   */
  readonly description?: string;

  /**
   * Tools to make available to the agent.
   */
  readonly tools?: DefineAgentToolInput[];

  /**
   * MCP servers to connect to.
   */
  readonly mcpServers?: MCPServerProps[];

  /**
   * Memory backend configuration for persisting conversational context.
   */
  readonly memory?: MemoryProps;
}

// ─── Default API key env vars per provider ──────────────────────────────────

const DEFAULT_API_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

// ─── Model shorthand parser ─────────────────────────────────────────────────

/**
 * Parse a model shorthand string like `'anthropic/claude-sonnet-4'` into
 * provider and modelId components.
 *
 * @throws If the string does not contain a `/` separator.
 */
function parseModelShorthand(shorthand: string): { provider: string; modelId: string } {
  const slashIndex = shorthand.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model shorthand '${shorthand}'. Expected format: 'provider/model-id' ` +
      `(e.g., 'anthropic/claude-sonnet-4').`,
    );
  }
  return {
    provider: shorthand.slice(0, slashIndex),
    modelId: shorthand.slice(slashIndex + 1),
  };
}

// ─── defineAgent ────────────────────────────────────────────────────────────

/**
 * Define an agent with a single function call — the Tier 1 "lite" API.
 *
 * Creates an {@link App} containing a single {@link Stack} with all the
 * constructs needed to fully describe the agent (Model, Tools, Prompt, etc.).
 * The returned App can be passed to the CLI or used to call `app.build()`
 * directly.
 *
 * This is the recommended getting-started experience. No construct tree
 * knowledge is required.
 *
 * @param options - Agent definition options.
 * @returns The {@link App} containing the fully constructed agent tree.
 *
 * @example
 * ```typescript
 * import { defineAgent } from '@agentforge/core';
 *
 * export default defineAgent({
 *   name: 'researcher',
 *   model: 'anthropic/claude-sonnet-4',
 *   prompt: 'You are a research assistant.',
 * });
 * ```
 */
export function defineAgent(options: DefineAgentOptions): App {
  const app = new App();
  const stack = new Stack(app, pascalCase(options.name));

  // ─── Model ────────────────────────────────────────────────────────────

  let model: Model;

  if (typeof options.model === 'string') {
    const { provider, modelId } = parseModelShorthand(options.model);
    const envVar = DEFAULT_API_KEY_ENV[provider];
    model = new Model(stack, 'Model', {
      provider,
      modelId,
      apiKey: envVar ? SecretRef.env(envVar) : undefined,
    });
  } else {
    model = new Model(stack, 'Model', options.model);
  }

  // ─── Tools ────────────────────────────────────────────────────────────

  const tools: Tool[] = [];

  if (options.tools) {
    for (let i = 0; i < options.tools.length; i++) {
      const toolInput = options.tools[i];
      const toolId = 'name' in toolInput && toolInput.name
        ? pascalCase(toolInput.name)
        : `Tool${i}`;

      // Normalize: if it has a description and handler but no inputSchema,
      // it's the inline shorthand. Otherwise treat as full ToolProps.
      if (isInlineToolShorthand(toolInput)) {
        tools.push(new Tool(stack, toolId, {
          name: toolInput.name,
          description: toolInput.description,
          handler: toolInput.handler,
        }));
      } else {
        tools.push(new Tool(stack, toolId, toolInput as ToolProps));
      }
    }
  }

  // ─── MCP Servers ──────────────────────────────────────────────────────

  const mcpServers: MCPServer[] = [];

  if (options.mcpServers) {
    for (let i = 0; i < options.mcpServers.length; i++) {
      const serverProps = options.mcpServers[i];
      const serverId = `MCPServer${i}`;
      mcpServers.push(new MCPServer(stack, serverId, serverProps));
    }
  }

  // ─── Memory ──────────────────────────────────────────────────────────

  let memory: Memory | undefined;

  if (options.memory) {
    memory = new Memory(stack, 'Memory', options.memory);
  }

  // ─── Agent ────────────────────────────────────────────────────────────

  const agent = new Agent(stack, 'Agent', {
    name: options.name,
    description: options.description,
    model,
    tools: tools.length > 0 ? tools : undefined,
    prompt: options.prompt,
    mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
  });

  if (memory) {
    agent.addMemory(memory);
  }

  return app;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check if a tool input is the inline shorthand form (has `handler` as a
 * function, not a ToolHandler object or file/mcp reference).
 */
function isInlineToolShorthand(
  input: DefineAgentToolInput,
): input is { name: string; description: string; handler: Function } {
  return (
    'handler' in input &&
    typeof input.handler === 'function'
  );
}

/**
 * Convert a kebab-case or snake_case string to PascalCase for construct IDs.
 */
function pascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}
