import { describe, it, expect } from 'vitest';
import {
  generateAgentsMd,
  generateA2AAgentCard,
  generateAgentSkillsManifest,
} from '../protocols.js';
import type { AgentResource } from '../assembly.js';
import type { A2AAgentCard, AgentSkillsManifest } from '../protocols.js';

// ─── Test data helpers ───────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentResource> = {}): AgentResource {
  return {
    type: 'agentforge::core::Agent',
    id: 'Stack/Agent',
    displayName: 'Agent',
    properties: { name: 'TestAgent', description: 'A test agent' },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
    ...overrides,
  };
}

function makeModel(overrides: Partial<AgentResource> = {}): AgentResource {
  return {
    type: 'agentforge::core::Model',
    id: 'Stack/Model',
    displayName: 'Claude',
    properties: { provider: 'anthropic', modelId: 'claude-sonnet-4' },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
    ...overrides,
  };
}

function makeTool(name: string, id: string = `Stack/${name}`): AgentResource {
  return {
    type: 'agentforge::core::Tool',
    id,
    displayName: name,
    properties: { name },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
  };
}

function makeGuardrail(name: string): AgentResource {
  return {
    type: 'agentforge::governance::Guardrail',
    id: `Stack/${name}`,
    displayName: name,
    properties: { name },
    dependencies: [],
    metadata: {},
    secretRefs: [],
    assetRefs: [],
  };
}

// ─── generateAgentsMd ────────────────────────────────────────────────────────

describe('generateAgentsMd', () => {
  it('produces header with "do not edit manually" notice', () => {
    const output = generateAgentsMd({});
    expect(output).toContain('# AGENTS.md');
    expect(output).toContain('do not edit manually');
  });

  it('shows "_No agents defined._" when no agent resources exist', () => {
    const output = generateAgentsMd({});
    expect(output).toContain('_No agents defined._');
  });

  it('shows "_No agents defined._" for non-agent resources only', () => {
    const resources = {
      'Stack/Model': makeModel(),
    };
    const output = generateAgentsMd(resources);
    expect(output).toContain('_No agents defined._');
  });

  it('lists agents with name and description', () => {
    const resources = {
      'Stack/Agent': makeAgent({
        properties: { name: 'researcher', description: 'Research assistant' },
      }),
    };
    const output = generateAgentsMd(resources);
    expect(output).toContain('## researcher');
    expect(output).toContain('- **Description:** Research assistant');
  });

  it('falls back to displayName when name property is missing', () => {
    const resources = {
      'Stack/Agent': makeAgent({
        displayName: 'FallbackName',
        properties: {},
      }),
    };
    const output = generateAgentsMd(resources);
    expect(output).toContain('## FallbackName');
  });

  it('shows model from direct model property', () => {
    const resources = {
      'Stack/Agent': makeAgent({
        properties: {
          name: 'MyAgent',
          model: 'anthropic/claude-sonnet-4',
        },
      }),
    };
    const output = generateAgentsMd(resources);
    expect(output).toContain('- **Model:** anthropic/claude-sonnet-4');
  });

  it('resolves model from dependency', () => {
    const model = makeModel({ id: 'Stack/Claude' });
    const agent = makeAgent({
      dependencies: ['Stack/Claude'],
      properties: { name: 'MyAgent' },
    });
    const resources = {
      'Stack/Agent': agent,
      'Stack/Claude': model,
    };
    const output = generateAgentsMd(resources);
    expect(output).toContain('- **Model:** anthropic/claude-sonnet-4');
  });

  it('lists tools from properties', () => {
    const agent = makeAgent({
      properties: {
        name: 'MyAgent',
        tools: ['web_search', 'file_read'],
      },
    });
    const output = generateAgentsMd({ 'Stack/Agent': agent });
    expect(output).toContain('- **Tools:** web_search, file_read');
  });

  it('lists tools from dependencies', () => {
    const agent = makeAgent({
      dependencies: ['Stack/web_search', 'Stack/file_read'],
      properties: { name: 'MyAgent' },
    });
    const resources = {
      'Stack/Agent': agent,
      'Stack/web_search': makeTool('web_search'),
      'Stack/file_read': makeTool('file_read'),
    };
    const output = generateAgentsMd(resources);
    expect(output).toContain('- **Tools:** web_search, file_read');
  });

  it('lists tools from object entries with name property', () => {
    const agent = makeAgent({
      properties: {
        name: 'MyAgent',
        tools: [{ name: 'search' }, { name: 'read' }],
      },
    });
    const output = generateAgentsMd({ 'Stack/Agent': agent });
    expect(output).toContain('- **Tools:** search, read');
  });

  it('deduplicates tools from props and dependencies', () => {
    const agent = makeAgent({
      properties: {
        name: 'MyAgent',
        tools: ['web_search'],
      },
      dependencies: ['Stack/web_search'],
    });
    const resources = {
      'Stack/Agent': agent,
      'Stack/web_search': makeTool('web_search'),
    };
    const output = generateAgentsMd(resources);
    // web_search should appear only once
    const toolLine = output.split('\n').find((l) => l.startsWith('- **Tools:**'));
    expect(toolLine).toBe('- **Tools:** web_search');
  });

  it('lists guardrails from dependencies', () => {
    const agent = makeAgent({
      dependencies: ['Stack/pii_redaction'],
      properties: { name: 'MyAgent' },
    });
    const resources = {
      'Stack/Agent': agent,
      'Stack/pii_redaction': makeGuardrail('pii_redaction'),
    };
    const output = generateAgentsMd(resources);
    expect(output).toContain('- **Guardrails:** pii_redaction');
  });

  it('lists multiple agents', () => {
    const resources = {
      'Stack/A1': makeAgent({
        id: 'Stack/A1',
        properties: { name: 'Researcher', description: 'Does research' },
      }),
      'Stack/A2': makeAgent({
        id: 'Stack/A2',
        properties: { name: 'Writer', description: 'Writes content' },
      }),
    };
    const output = generateAgentsMd(resources);
    expect(output).toContain('## Researcher');
    expect(output).toContain('## Writer');
  });
});

// ─── generateA2AAgentCard ────────────────────────────────────────────────────

describe('generateA2AAgentCard', () => {
  it('returns null when no agents exist', () => {
    expect(generateA2AAgentCard({})).toBeNull();
    expect(generateA2AAgentCard({ 'Stack/Model': makeModel() })).toBeNull();
  });

  it('produces a valid A2A card JSON', () => {
    const resources = {
      'Stack/Agent': makeAgent({
        properties: { name: 'ResearchBot', description: 'Does research' },
      }),
    };
    const json = generateA2AAgentCard(resources);
    expect(json).not.toBeNull();
    const card = JSON.parse(json!) as A2AAgentCard;
    expect(card.name).toBe('ResearchBot');
    expect(card.description).toBe('Does research');
    expect(card.version).toBe('1.0.0');
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(false);
    expect(card.capabilities.stateTransitionHistory).toBe(false);
  });

  it('includes tool resources as skills', () => {
    const agent = makeAgent({
      properties: { name: 'Agent' },
      dependencies: ['Stack/search', 'Stack/read'],
    });
    const resources: Record<string, AgentResource> = {
      'Stack/Agent': agent,
      'Stack/search': makeTool('search'),
      'Stack/read': makeTool('read'),
    };
    const json = generateA2AAgentCard(resources);
    const card = JSON.parse(json!) as A2AAgentCard;
    expect(card.skills).toHaveLength(2);
    expect(card.skills[0]!.id).toBe('search');
    expect(card.skills[1]!.id).toBe('read');
  });

  it('falls back to displayName when name property is missing', () => {
    const agent = makeAgent({
      displayName: 'FallbackAgent',
      properties: {},
    });
    const json = generateA2AAgentCard({ 'Stack/Agent': agent });
    const card = JSON.parse(json!) as A2AAgentCard;
    expect(card.name).toBe('FallbackAgent');
  });
});

describe('generateA2AAgentCard — full implementation', () => {
  it('generates card with tools as skills including inputSchema', () => {
    const resources: Record<string, AgentResource> = {
      'Stack/Agent': {
        type: 'agentforge::core::Agent',
        id: 'Stack/Agent',
        displayName: 'ResearchBot',
        properties: {
          name: 'researcher',
          description: 'Researches topics',
          tools: ['Stack/SearchTool'],
        },
        dependencies: ['Stack/Model', 'Stack/SearchTool'],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
      'Stack/SearchTool': {
        type: 'agentforge::core::Tool',
        id: 'Stack/SearchTool',
        displayName: 'SearchTool',
        properties: {
          name: 'web_search',
          description: 'Search the web for information',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
        dependencies: [],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
      'Stack/Model': {
        type: 'agentforge::core::Model',
        id: 'Stack/Model',
        displayName: 'Model',
        properties: { provider: 'anthropic', modelId: 'claude-sonnet-4' },
        dependencies: [],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
    };

    const card = generateA2AAgentCard(resources);
    expect(card).not.toBeNull();
    const parsed = JSON.parse(card!);
    expect(parsed.name).toBe('researcher');
    expect(parsed.description).toBe('Researches topics');
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.capabilities).toEqual({
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    });
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0].id).toBe('web_search');
    expect(parsed.skills[0].name).toBe('web_search');
    expect(parsed.skills[0].description).toBe('Search the web for information');
    expect(parsed.skills[0].inputSchema).toEqual({
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    });
  });

  it('generates card for multi-agent assembly using first agent', () => {
    const resources: Record<string, AgentResource> = {
      'Stack/Agent1': {
        type: 'agentforge::core::Agent',
        id: 'Stack/Agent1',
        displayName: 'Agent1',
        properties: { name: 'first', description: 'First agent' },
        dependencies: [],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
      'Stack/Agent2': {
        type: 'agentforge::core::Agent',
        id: 'Stack/Agent2',
        displayName: 'Agent2',
        properties: { name: 'second', description: 'Second agent' },
        dependencies: [],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
    };

    const card = generateA2AAgentCard(resources);
    const parsed = JSON.parse(card!);
    expect(parsed.name).toBe('first');
    // Multi-agent: all agents listed as skills
    expect(parsed.skills).toHaveLength(2);
  });

  it('includes model info in provider field when available', () => {
    const resources: Record<string, AgentResource> = {
      'Stack/Agent': {
        type: 'agentforge::core::Agent',
        id: 'Stack/Agent',
        displayName: 'Agent',
        properties: { name: 'bot', description: 'A bot', model: 'Stack/Model' },
        dependencies: ['Stack/Model'],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
      'Stack/Model': {
        type: 'agentforge::core::Model',
        id: 'Stack/Model',
        displayName: 'Model',
        properties: { provider: 'anthropic', modelId: 'claude-sonnet-4' },
        dependencies: [],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
    };

    const card = generateA2AAgentCard(resources);
    const parsed = JSON.parse(card!);
    expect(parsed.provider).toEqual({
      organization: 'anthropic',
      model: 'claude-sonnet-4',
    });
  });
});

// ─── generateAgentSkillsManifest ─────────────────────────────────────────────

describe('generateAgentSkillsManifest', () => {
  it('returns null when no agents exist', () => {
    expect(generateAgentSkillsManifest({})).toBeNull();
  });

  it('produces a valid skills manifest JSON', () => {
    const resources = {
      'Stack/Agent': makeAgent({
        properties: { name: 'My Bot', description: 'A helpful bot' },
      }),
    };
    const json = generateAgentSkillsManifest(resources);
    expect(json).not.toBeNull();
    const manifest = JSON.parse(json!) as AgentSkillsManifest;
    expect(manifest.schema_version).toBe('1.0');
    expect(manifest.name_for_human).toBe('My Bot');
    expect(manifest.name_for_model).toBe('my_bot');
    expect(manifest.description_for_human).toBe('A helpful bot');
    expect(manifest.description_for_model).toBe('A helpful bot');
  });

  it('includes tool resources as skills', () => {
    const agent = makeAgent({
      properties: { name: 'Agent' },
      dependencies: ['Stack/search'],
    });
    const resources: Record<string, AgentResource> = {
      'Stack/Agent': agent,
      'Stack/search': makeTool('search'),
    };
    const json = generateAgentSkillsManifest(resources);
    const manifest = JSON.parse(json!) as AgentSkillsManifest;
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0]!.name).toBe('search');
  });

  it('normalizes name_for_model', () => {
    const agent = makeAgent({
      properties: { name: 'My Cool Agent' },
    });
    const json = generateAgentSkillsManifest({ 'Stack/Agent': agent });
    const manifest = JSON.parse(json!) as AgentSkillsManifest;
    expect(manifest.name_for_model).toBe('my_cool_agent');
  });
});

describe('generateAgentSkillsManifest — full implementation', () => {
  it('generates manifest with tool input schemas', () => {
    const resources: Record<string, AgentResource> = {
      'Stack/Agent': {
        type: 'agentforge::core::Agent',
        id: 'Stack/Agent',
        displayName: 'Agent',
        properties: {
          name: 'My Agent',
          description: 'A helpful agent',
          tools: ['Stack/Tool'],
        },
        dependencies: ['Stack/Tool'],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
      'Stack/Tool': {
        type: 'agentforge::core::Tool',
        id: 'Stack/Tool',
        displayName: 'Tool',
        properties: {
          name: 'calculator',
          description: 'Performs math calculations',
          inputSchema: {
            type: 'object',
            properties: { expression: { type: 'string' } },
            required: ['expression'],
          },
        },
        dependencies: [],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
    };

    const manifest = generateAgentSkillsManifest(resources);
    expect(manifest).not.toBeNull();
    const parsed = JSON.parse(manifest!);
    expect(parsed.schema_version).toBe('1.0');
    expect(parsed.name_for_human).toBe('My Agent');
    expect(parsed.name_for_model).toBe('my_agent');
    expect(parsed.description_for_human).toBe('A helpful agent');
    expect(parsed.description_for_model).toBe('A helpful agent');
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0].name).toBe('calculator');
    expect(parsed.skills[0].description).toBe('Performs math calculations');
    expect(parsed.skills[0].parameters).toEqual({
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    });
  });

  it('generates skills from multiple tools across agents', () => {
    const resources: Record<string, AgentResource> = {
      'Stack/Agent': {
        type: 'agentforge::core::Agent',
        id: 'Stack/Agent',
        displayName: 'Agent',
        properties: { name: 'bot', tools: ['Stack/T1', 'Stack/T2'] },
        dependencies: ['Stack/T1', 'Stack/T2'],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
      'Stack/T1': {
        type: 'agentforge::core::Tool',
        id: 'Stack/T1',
        displayName: 'T1',
        properties: { name: 'search', description: 'Search' },
        dependencies: [],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
      'Stack/T2': {
        type: 'agentforge::core::Tool',
        id: 'Stack/T2',
        displayName: 'T2',
        properties: { name: 'write', description: 'Write' },
        dependencies: [],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
    };

    const manifest = generateAgentSkillsManifest(resources);
    const parsed = JSON.parse(manifest!);
    expect(parsed.skills).toHaveLength(2);
    expect(parsed.skills.map((s: { name: string }) => s.name)).toEqual(['search', 'write']);
  });

  it('deduplicates tool skills by name', () => {
    const resources: Record<string, AgentResource> = {
      'Stack/A1': {
        type: 'agentforge::core::Agent',
        id: 'Stack/A1',
        displayName: 'A1',
        properties: { name: 'bot1', tools: ['Stack/T'] },
        dependencies: ['Stack/T'],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
      'Stack/A2': {
        type: 'agentforge::core::Agent',
        id: 'Stack/A2',
        displayName: 'A2',
        properties: { name: 'bot2', tools: ['Stack/T'] },
        dependencies: ['Stack/T'],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
      'Stack/T': {
        type: 'agentforge::core::Tool',
        id: 'Stack/T',
        displayName: 'T',
        properties: { name: 'shared_tool', description: 'Shared' },
        dependencies: [],
        metadata: {},
        secretRefs: [],
        assetRefs: [],
      },
    };

    const manifest = generateAgentSkillsManifest(resources);
    const parsed = JSON.parse(manifest!);
    expect(parsed.skills).toHaveLength(1);
  });
});
