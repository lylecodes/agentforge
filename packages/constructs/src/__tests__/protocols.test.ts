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
  });

  it('includes tools as skills', () => {
    const agent = makeAgent({
      properties: { name: 'Agent', tools: ['search', 'read'] },
    });
    const json = generateA2AAgentCard({ 'Stack/Agent': agent });
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

  it('includes tools as skills', () => {
    const agent = makeAgent({
      properties: { name: 'Agent', tools: ['search'] },
    });
    const json = generateAgentSkillsManifest({ 'Stack/Agent': agent });
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
