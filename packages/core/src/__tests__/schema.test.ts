import { describe, it, expect } from 'vitest';
import { App, Stack } from '@agentforge/constructs';
import { Schema, SchemaFormat } from '../schema.js';
import { z } from 'zod';

describe('Schema', () => {
  function createStack() {
    const app = new App();
    return new Stack(app, 'Test');
  }

  describe('construction', () => {
    it('creates schema from JSON Schema definition', () => {
      const stack = createStack();
      const schema = new Schema(stack, 'Output', {
        format: SchemaFormat.JSON_SCHEMA,
        definition: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['summary', 'confidence'],
        },
      });
      expect(schema.format).toBe(SchemaFormat.JSON_SCHEMA);
      expect(schema.resourceType).toBe('agentforge::core::Schema');
    });

    it('creates schema from Zod definition', () => {
      const stack = createStack();
      const zodSchema = z.object({
        summary: z.string(),
        confidence: z.number().min(0).max(1),
        sources: z.array(z.string()),
      });
      const schema = new Schema(stack, 'Output', {
        format: SchemaFormat.ZOD,
        definition: zodSchema,
      });
      expect(schema.format).toBe(SchemaFormat.ZOD);
    });
  });

  describe('serialization', () => {
    it('serializes JSON Schema definition as-is', () => {
      const stack = createStack();
      const def = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };
      const schema = new Schema(stack, 'S', {
        format: SchemaFormat.JSON_SCHEMA,
        definition: def,
      });
      const assembly = schema.toAssemblyResource();
      expect(assembly.properties.format).toBe('json_schema');
      expect(assembly.properties.definition).toEqual(def);
    });

    it('converts Zod definition to JSON Schema in assembly', () => {
      const stack = createStack();
      const zodSchema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const schema = new Schema(stack, 'S', {
        format: SchemaFormat.ZOD,
        definition: zodSchema,
      });
      const assembly = schema.toAssemblyResource();
      expect(assembly.properties.format).toBe('json_schema');
      const def = assembly.properties.definition as Record<string, unknown>;
      expect(def.type).toBe('object');
      expect(def.properties).toBeDefined();
    });

    it('includes description when provided', () => {
      const stack = createStack();
      const schema = new Schema(stack, 'S', {
        format: SchemaFormat.JSON_SCHEMA,
        definition: { type: 'object' },
        description: 'Output format for analysis',
      });
      const assembly = schema.toAssemblyResource();
      expect(assembly.properties.description).toBe('Output format for analysis');
    });
  });
});
