/**
 * @module schema
 *
 * The Schema construct represents a structured data schema that can be used
 * as an agent's input or output contract. Schemas can be defined using
 * JSON Schema directly or via Zod types (auto-converted to JSON Schema
 * at synthesis time).
 *
 * @example
 * ```typescript
 * // JSON Schema definition
 * const outputSchema = new Schema(stack, 'Output', {
 *   format: SchemaFormat.JSON_SCHEMA,
 *   definition: {
 *     type: 'object',
 *     properties: { summary: { type: 'string' } },
 *     required: ['summary'],
 *   },
 * });
 *
 * // Zod definition (auto-converted)
 * const zodSchema = new Schema(stack, 'Output', {
 *   format: SchemaFormat.ZOD,
 *   definition: z.object({ summary: z.string() }),
 * });
 * ```
 */

import { type Construct } from 'constructs';
import { AgentResourceBase } from '@agentforge/constructs';
import type { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ─── Resource Type ──────────────────────────────────────────────────────────

/** Assembly resource type for Schema constructs. */
const SCHEMA_RESOURCE_TYPE = 'agentforge::core::Schema';

// ─── Schema Format Enum ─────────────────────────────────────────────────────

/**
 * The format of the schema definition.
 */
export enum SchemaFormat {
  /** Standard JSON Schema format. */
  JSON_SCHEMA = 'json_schema',

  /** Zod schema (converted to JSON Schema during synthesis). */
  ZOD = 'zod',
}

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for a {@link Schema} construct.
 */
export interface SchemaProps {
  /** The format of the schema definition. */
  readonly format: SchemaFormat;

  /**
   * The schema definition.
   * - For {@link SchemaFormat.JSON_SCHEMA}: a raw JSON Schema object.
   * - For {@link SchemaFormat.ZOD}: a Zod type instance.
   */
  readonly definition: Record<string, unknown> | ZodType;

  /** Optional human-readable description of the schema's purpose. */
  readonly description?: string;
}

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * A structured data schema for agent input/output contracts.
 *
 * Schema constructs allow agents to declare their expected input and output
 * formats. Zod definitions are automatically converted to JSON Schema during
 * assembly serialization, ensuring a consistent format in the IR.
 *
 * The assembly serializes Schema as `agentforge::core::Schema`.
 */
export class Schema extends AgentResourceBase {
  /** The declared schema format. */
  public readonly format: SchemaFormat;

  /** Optional description of the schema's purpose. */
  public readonly description?: string;

  /** The raw definition (Zod or JSON Schema). */
  private readonly _definition: Record<string, unknown> | ZodType;

  constructor(scope: Construct, id: string, props: SchemaProps) {
    super(scope, id, SCHEMA_RESOURCE_TYPE);

    this.format = props.format;
    this.description = props.description;
    this._definition = props.definition;
  }

  // ─── Public Accessors ───────────────────────────────────────────────────

  /**
   * Returns the schema definition as a JSON Schema object.
   * If the source format is Zod, the conversion happens here.
   */
  public get jsonSchemaDefinition(): Record<string, unknown> {
    if (this.format === SchemaFormat.ZOD) {
      return zodToJsonSchema(this._definition as ZodType) as Record<string, unknown>;
    }
    return this._definition as Record<string, unknown>;
  }

  // ─── Serialization ──────────────────────────────────────────────────────

  /**
   * Returns the resolved properties for assembly serialization.
   *
   * Zod definitions are converted to JSON Schema so the assembly IR
   * always contains standard JSON Schema.
   *
   * @internal
   */
  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      format: 'json_schema',
      definition: this.jsonSchemaDefinition,
    };

    if (this.description !== undefined) {
      props.description = this.description;
    }

    return props;
  }
}
