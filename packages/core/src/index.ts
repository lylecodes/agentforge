/**
 * @module @agentforge/core
 *
 * Core agent constructs for AgentForge — the IaC tool for AI agents.
 *
 * This package provides the fundamental building blocks for defining agents:
 *
 * - {@link Agent} — the central construct that ties model, tools, and prompt together.
 * - {@link Model} — LLM configuration (provider, model ID, parameters, API key).
 * - {@link Tool} — a callable capability with inline, file, MCP, or builtin handlers.
 * - {@link Prompt} — a prompt template with variables and few-shot examples.
 * - {@link MCPServer} — an MCP server definition (stdio transport).
 * - {@link defineAgent} — Tier 1 "lite" API for zero-construct-knowledge agent definition.
 *
 * @example
 * ```typescript
 * // Tier 1: One function, zero construct knowledge
 * import { defineAgent } from '@agentforge/core';
 *
 * export default defineAgent({
 *   name: 'researcher',
 *   model: 'anthropic/claude-sonnet-4',
 *   prompt: 'You are a research assistant.',
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Tier 2: Full construct API
 * import { Stack } from '@agentforge/constructs';
 * import { Agent, Model, Tool, Prompt } from '@agentforge/core';
 *
 * const stack = new Stack('my-agent');
 * const model = Model.anthropic(stack, 'Claude', 'claude-sonnet-4');
 * const agent = new Agent(stack, 'Assistant', { name: 'assistant', model });
 * ```
 */

// ─── Agent ──────────────────────────────────────────────────────────────────

export { Agent } from './agent.js';
export type { AgentProps } from './agent.js';

// ─── Model ──────────────────────────────────────────────────────────────────

export { Model } from './model.js';
export type { ModelProps, ModelFactoryOptions } from './model.js';

// ─── Tool ───────────────────────────────────────────────────────────────────

export { Tool } from './tool.js';
export type {
  ToolProps,
  ToolHandler,
  ToolHandlerInput,
  InlineFunctionHandler,
  FileHandler,
  MCPHandler,
  BuiltinHandler,
  SchemaInput,
} from './tool.js';

// ─── Prompt ─────────────────────────────────────────────────────────────────

export { Prompt } from './prompt.js';
export type {
  PromptProps,
  PromptFromAssetOptions,
  PromptRole,
  FewShotExample,
} from './prompt.js';

// ─── MCPServer ──────────────────────────────────────────────────────────────

export { MCPServer } from './mcp-server.js';
export type { MCPServerProps } from './mcp-server.js';

// ─── Memory ─────────────────────────────────────────────────────────────────

export { Memory, MemoryType } from './memory.js';
export type { MemoryProps } from './memory.js';

// ─── defineAgent (Tier 1 API) ───────────────────────────────────────────────

export { defineAgent } from './define-agent.js';
export type { DefineAgentOptions, DefineAgentToolInput } from './define-agent.js';
