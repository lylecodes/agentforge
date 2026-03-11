/**
 * @module codegen
 *
 * Code generation utilities for the DockerTarget compiler.
 *
 * Generates Docker deployment artifacts: Dockerfile, docker-compose.yml,
 * .env.example, agent modules (Vercel AI SDK), an HTTP runtime, and
 * package.json. All generated code targets Node.js 22 with ESM modules.
 */

import type { AgentAssembly, AgentResource } from './types.js';

// ─── Provider Mapping ───────────────────────────────────────────────────────

/**
 * Maps a model provider name to its Vercel AI SDK package and factory.
 */
const PROVIDER_MAP: Record<string, { pkg: string; factory: string }> = {
  anthropic: { pkg: '@ai-sdk/anthropic', factory: 'anthropic' },
  openai: { pkg: '@ai-sdk/openai', factory: 'openai' },
  google: { pkg: '@ai-sdk/google', factory: 'google' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sanitize a display name into a valid JS identifier.
 */
function toIdentifier(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_$]/g, '_')
    .replace(/^(\d)/, '_$1');
}

/**
 * Find resources of a given type in the assembly.
 */
function findResources(assembly: AgentAssembly, type: string): AgentResource[] {
  return Object.values(assembly.resources).filter(r => r.type === type);
}


// ─── Dockerfile Generation ──────────────────────────────────────────────────

/**
 * Generate a multi-stage Dockerfile for a Node.js 22 Alpine build.
 *
 * Stage 1 (builder): Install dependencies and compile TypeScript.
 * Stage 2 (runtime): Copy compiled output and run the HTTP server.
 *
 * @returns Dockerfile content as a string.
 */
export function generateDockerfile(): string {
  return `# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and compile
COPY . .
RUN npx tsc

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Set environment
ENV NODE_ENV=production

# Expose the HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the runtime
CMD ["node", "dist/runtime.js"]
`;
}

// ─── Docker Compose Generation ──────────────────────────────────────────────

/**
 * Generate a docker-compose.yml string from an Agent Assembly.
 *
 * Creates a service for the main agent runtime, plus sidecar services
 * for any MCP servers defined in the assembly. Environment variables
 * are wired from SecretRefs with env-type sources.
 *
 * @param assembly - The Agent Assembly to generate from.
 * @returns docker-compose.yml content as a YAML string.
 */
export function generateDockerCompose(assembly: AgentAssembly): string {
  const agents = findResources(assembly, 'agentforge::core::Agent');
  const mcpServers = findResources(assembly, 'agentforge::core::MCPServer');

  // Collect env-type secret refs for the main service
  const envVars = collectEnvSecretRefs(assembly);

  const lines: string[] = [];
  lines.push('services:');

  // Main agent runtime service
  lines.push('  agent-runtime:');
  lines.push('    build:');
  lines.push('      context: .');
  lines.push('      dockerfile: Dockerfile');
  lines.push(`    container_name: ${assembly.metadata.stackName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-runtime`);
  lines.push('    ports:');
  lines.push('      - "3000:3000"');

  if (envVars.length > 0) {
    lines.push('    environment:');
    for (const envVar of envVars) {
      lines.push(`      - ${envVar}=\${${envVar}}`);
    }
  }

  lines.push('    restart: unless-stopped');
  lines.push('    healthcheck:');
  lines.push('      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]');
  lines.push('      interval: 30s');
  lines.push('      timeout: 5s');
  lines.push('      retries: 3');
  lines.push('      start_period: 10s');

  if (mcpServers.length > 0) {
    lines.push('    depends_on:');
    for (const mcp of mcpServers) {
      const serviceName = toServiceName(mcp.displayName);
      lines.push(`      - ${serviceName}`);
    }
  }

  // MCP sidecar services
  for (const mcp of mcpServers) {
    const serviceName = toServiceName(mcp.displayName);
    const props = mcp.properties as Record<string, unknown>;
    const command = (props['command'] as string) ?? 'npx';
    const args = (props['args'] as string[]) ?? [];
    const env = (props['env'] as Record<string, string>) ?? {};

    lines.push('');
    lines.push(`  ${serviceName}:`);
    lines.push('    image: node:22-alpine');
    lines.push(`    container_name: ${serviceName}`);
    lines.push(`    command: ["${command}", ${args.map(a => `"${a}"`).join(', ')}]`);

    if (Object.keys(env).length > 0) {
      lines.push('    environment:');
      for (const [key, value] of Object.entries(env)) {
        lines.push(`      - ${key}=${value}`);
      }
    }

    lines.push('    restart: unless-stopped');
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Convert a display name to a docker-compose service name.
 */
function toServiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── .env.example Generation ────────────────────────────────────────────────

/**
 * Generate a .env.example file from the assembly's SecretRefs.
 *
 * Collects all env-type secret references across all resources,
 * deduplicates them, and produces a template .env file with
 * placeholder values.
 *
 * @param assembly - The Agent Assembly.
 * @returns .env.example content as a string.
 */
export function generateEnvExample(assembly: AgentAssembly): string {
  const envVars = collectEnvSecretRefs(assembly);

  if (envVars.length === 0) {
    return `# No environment variables required for this stack.
# Add your configuration here if needed.
`;
  }

  const lines: string[] = [
    `# Environment variables for ${assembly.metadata.stackName}`,
    `# Copy this file to .env and fill in the values.`,
    '',
  ];

  for (const envVar of envVars) {
    lines.push(`${envVar}=`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Collect deduplicated env-type secret variable names from the assembly.
 */
function collectEnvSecretRefs(assembly: AgentAssembly): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const resource of Object.values(assembly.resources)) {
    for (const secretRef of resource.secretRefs) {
      if (secretRef.source.type === 'env') {
        const varName = secretRef.source.variableName;
        if (!seen.has(varName)) {
          seen.add(varName);
          result.push(varName);
        }
      }
    }
  }

  return result;
}

// ─── Agent Module Generation ────────────────────────────────────────────────

/**
 * Generate a TypeScript module for a single agent.
 *
 * Reuses the Vercel AI SDK pattern from the local target. The generated
 * module exports a `chat()` function, `resetConversation()`, and
 * `agentName`. It uses `generateText` for model invocation.
 *
 * @param agentResource  - The Agent resource from the assembly.
 * @param modelResource  - The Model resource bound to this agent (may be undefined).
 * @param toolResources  - Tool resources bound to this agent.
 * @param promptResource - The Prompt resource bound to this agent (may be undefined).
 * @param mcpResources   - MCP Server resources bound to this agent.
 * @param assembly       - The full Agent Assembly.
 * @returns Generated TypeScript source code as a string.
 */
export function generateAgentModule(
  agentResource: AgentResource,
  modelResource: AgentResource | undefined,
  toolResources: AgentResource[],
  promptResource: AgentResource | undefined,
  mcpResources: AgentResource[],
  assembly: AgentAssembly,
): string {
  const agentName = agentResource.displayName;
  const props = agentResource.properties as Record<string, unknown>;

  // Resolve model provider and model ID.
  const provider = (modelResource?.properties as Record<string, unknown>)?.provider as string | undefined ?? 'anthropic';
  const modelId = (modelResource?.properties as Record<string, unknown>)?.modelId as string | undefined ?? 'claude-sonnet-4';
  const providerInfo = PROVIDER_MAP[provider] ?? PROVIDER_MAP['anthropic']!;

  // Resolve system prompt.
  const systemPrompt = resolveSystemPrompt(props, promptResource);

  // Build imports.
  const imports: string[] = [
    `import { generateText } from 'ai';`,
    `import { ${providerInfo.factory} } from '${providerInfo.pkg}';`,
  ];

  if (mcpResources.length > 0) {
    imports.push(`import { Client } from '@modelcontextprotocol/sdk/client/index.js';`);
    imports.push(`import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';`);
  }

  // Build tool definitions.
  const toolsCode = generateToolDefinitions(toolResources, assembly);

  // Build MCP setup code.
  const mcpSetup = mcpResources.length > 0
    ? generateMCPSetup(mcpResources)
    : '';

  const code = `${imports.join('\n')}

/**
 * Agent: ${agentName}
 * Generated by @agentforge/target-docker
 */

type Message = { role: 'user' | 'assistant'; content: string };

const conversationHistory: Message[] = [];

const SYSTEM_PROMPT = ${JSON.stringify(systemPrompt)};

${mcpSetup}
${toolsCode}

/**
 * Send a message to the ${agentName} agent and receive a response.
 *
 * @param userMessage - The user's input message.
 * @returns The assistant's response text.
 */
export async function chat(userMessage: string): Promise<string> {${mcpResources.length > 0 ? '\n  await initMCPClients();' : ''}

  conversationHistory.push({ role: 'user', content: userMessage });

  const result = await generateText({
    model: ${providerInfo.factory}('${modelId}'),
    system: SYSTEM_PROMPT,
    messages: conversationHistory,${toolsCode.trim() ? `\n    tools: agentTools,\n    maxSteps: 10,` : ''}
  });

  const assistantMessage = result.text;
  conversationHistory.push({ role: 'assistant', content: assistantMessage });

  return assistantMessage;
}

/**
 * Reset the conversation history for this agent.
 */
export function resetConversation(): void {
  conversationHistory.length = 0;
}

/**
 * Get the agent's display name.
 */
export const agentName = ${JSON.stringify(agentName)};
`;

  return code;
}

// ─── System Prompt Resolution ───────────────────────────────────────────────

/**
 * Resolve the system prompt from agent properties or a bound Prompt resource.
 */
function resolveSystemPrompt(
  agentProps: Record<string, unknown>,
  promptResource: AgentResource | undefined,
): string {
  if (promptResource) {
    const promptProps = promptResource.properties as Record<string, unknown>;
    if (typeof promptProps['content'] === 'string') {
      return promptProps['content'];
    }
    if (typeof promptProps['template'] === 'string') {
      return promptProps['template'];
    }
  }

  if (typeof agentProps['systemPrompt'] === 'string') {
    return agentProps['systemPrompt'];
  }
  if (typeof agentProps['prompt'] === 'string') {
    return agentProps['prompt'];
  }

  return 'You are a helpful assistant.';
}

// ─── Tool Definition Generation ─────────────────────────────────────────────

/**
 * Generate the `agentTools` object definition for Vercel AI SDK.
 */
function generateToolDefinitions(
  toolResources: AgentResource[],
  assembly: AgentAssembly,
): string {
  if (toolResources.length === 0) return '';

  const imports = [`import { z } from 'zod';`, `import { tool } from 'ai';`];
  const toolEntries: string[] = [];

  for (const toolRes of toolResources) {
    const props = toolRes.properties as Record<string, unknown>;
    const toolName = toIdentifier(toolRes.displayName);
    const description = (props['description'] as string) ?? `Tool: ${toolRes.displayName}`;
    const parameters = props['parameters'] as Record<string, unknown> | undefined;
    const handlerType = (props['handlerType'] as string) ?? 'inline';

    const zodSchema = generateZodSchema(parameters);
    const executeBody = generateToolExecute(toolRes, handlerType, assembly);

    toolEntries.push(`  ${toolName}: tool({
    description: ${JSON.stringify(description)},
    parameters: ${zodSchema},
    execute: async (${parameters ? 'params' : ''}) => {
${executeBody}
    },
  })`);
  }

  return `
${imports.join('\n')}

const agentTools = {
${toolEntries.join(',\n')},
};
`;
}

/**
 * Generate a Zod schema from a parameter definition object.
 */
function generateZodSchema(parameters: Record<string, unknown> | undefined): string {
  if (!parameters || Object.keys(parameters).length === 0) {
    return 'z.object({})';
  }

  const fields: string[] = [];
  for (const [key, def] of Object.entries(parameters)) {
    const paramDef = def as Record<string, unknown>;
    const type = (paramDef['type'] as string) ?? 'string';
    const description = paramDef['description'] as string | undefined;

    let zodType: string;
    switch (type) {
      case 'number':
      case 'integer':
        zodType = 'z.number()';
        break;
      case 'boolean':
        zodType = 'z.boolean()';
        break;
      case 'array':
        zodType = 'z.array(z.unknown())';
        break;
      case 'object':
        zodType = 'z.object({}).passthrough()';
        break;
      default:
        zodType = 'z.string()';
    }

    if (description) {
      zodType += `.describe(${JSON.stringify(description)})`;
    }

    if (paramDef['optional'] === true || paramDef['required'] === false) {
      zodType += '.optional()';
    }

    fields.push(`    ${key}: ${zodType}`);
  }

  return `z.object({\n${fields.join(',\n')},\n  })`;
}

/**
 * Generate the body of a tool's execute function.
 */
function generateToolExecute(
  toolRes: AgentResource,
  handlerType: string,
  _assembly: AgentAssembly,
): string {
  const props = toolRes.properties as Record<string, unknown>;

  switch (handlerType) {
    case 'file': {
      const handlerPath = (props['handlerFile'] as string) ?? (props['handler'] as string);
      if (handlerPath) {
        const assetPath = `./tools/${handlerPath.split('/').pop()}`;
        return `      const handler = await import('${assetPath}');\n      return handler.default(params);`;
      }
      return `      throw new Error('Tool handler file not configured');`;
    }

    case 'mcp': {
      const mcpToolName = (props['mcpToolName'] as string) ?? toolRes.displayName;
      const serverId = (props['mcpServerId'] as string) ?? '';
      const clientVar = toIdentifier(serverId || 'default') + 'Client';
      return `      const result = await ${clientVar}.callTool({ name: ${JSON.stringify(mcpToolName)}, arguments: params });\n      return result.content;`;
    }

    case 'inline':
    default: {
      const handlerCode = props['handlerCode'] as string | undefined;
      if (handlerCode) {
        return `      ${handlerCode}`;
      }
      if (toolRes.assetRefs.length > 0) {
        const assetRef = toolRes.assetRefs[0]!;
        const assetPath = `./tools/${assetRef.assemblyPath.split('/').pop()}`;
        return `      const handler = await import('${assetPath}');\n      return handler.default(params);`;
      }
      return `      throw new Error('Tool handler not implemented: ${toolRes.displayName}');`;
    }
  }
}

// ─── MCP Setup Generation ───────────────────────────────────────────────────

/**
 * Generate code that spawns MCP server processes and creates clients.
 */
function generateMCPSetup(mcpResources: AgentResource[]): string {
  if (mcpResources.length === 0) return '';

  const declarations: string[] = [];
  const initSteps: string[] = [];

  for (const mcpRes of mcpResources) {
    const props = mcpRes.properties as Record<string, unknown>;
    const serverName = mcpRes.displayName;
    const clientVar = toIdentifier(serverName) + 'Client';
    const command = (props['command'] as string) ?? 'npx';
    const args = (props['args'] as string[]) ?? [];
    const env = (props['env'] as Record<string, string>) ?? {};

    declarations.push(`let ${clientVar}: Client;`);

    const envEntries = Object.entries(env)
      .map(([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(',\n');

    const envBlock = Object.keys(env).length > 0
      ? `,\n    env: {\n      ...process.env as Record<string, string>,\n${envEntries},\n    }`
      : '';

    initSteps.push(`  // Initialize MCP server: ${serverName}
  const ${clientVar}Transport = new StdioClientTransport({
    command: ${JSON.stringify(command)},
    args: ${JSON.stringify(args)}${envBlock},
  });

  ${clientVar} = new Client(
    { name: ${JSON.stringify(serverName + '-client')}, version: '1.0.0' },
    { capabilities: {} },
  );

  await ${clientVar}.connect(${clientVar}Transport);
  const ${clientVar}Tools = await ${clientVar}.listTools();
  console.log('[MCP] Connected to ${serverName}:', ${clientVar}Tools.tools.map(t => t.name).join(', '));`);
  }

  return `
${declarations.join('\n')}
let mcpInitialized = false;

async function initMCPClients(): Promise<void> {
  if (mcpInitialized) return;
  mcpInitialized = true;

${initSteps.join('\n\n')}
}
`;
}

// ─── Docker Runtime Generation ──────────────────────────────────────────────

/**
 * Generate the main HTTP runtime entrypoint (`runtime.ts`).
 *
 * Instead of readline (local target), the Docker runtime creates an
 * HTTP server using `node:http`. Each agent is exposed at:
 * - POST /agents/:name/chat — send a message, receive a response
 * - POST /agents/:name/reset — reset conversation history
 * - GET /agents — list available agents
 * - GET /health — health check endpoint
 *
 * @param agents - Array of agent display names (matching generated module filenames).
 * @returns Generated TypeScript source code for the runtime entrypoint.
 */
export function generateDockerRuntime(agents: string[]): string {
  if (agents.length === 0) {
    return `import { createServer } from 'node:http';

const server = createServer((_req, res) => {
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'No agents configured' }));
});

server.listen(3000, () => {
  console.error('No agents configured. Please define at least one Agent resource.');
});
`;
  }

  const importStatements = agents.map(name => {
    const id = toIdentifier(name);
    return `import * as ${id}Agent from './agents/${name}.js';`;
  });

  const agentMapEntries = agents.map(name => {
    const id = toIdentifier(name);
    return `  '${name}': ${id}Agent`;
  }).join(',\n');

  return `${importStatements.join('\n')}
import { createServer } from 'node:http';

/**
 * AgentForge Docker Runtime
 * ${agents.length} agent(s) available
 * Generated by @agentforge/target-docker
 */

const agents: Record<string, { chat: (msg: string) => Promise<string>; resetConversation: () => void; agentName: string }> = {
${agentMapEntries},
};

const agentNames = Object.keys(agents);

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

function parseBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', \`http://localhost:\${PORT}\`);
  const pathname = url.pathname;

  // Health check
  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', agents: agentNames }));
    return;
  }

  // List agents
  if (pathname === '/agents' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents: agentNames }));
    return;
  }

  // Agent chat: POST /agents/:name/chat
  const chatMatch = pathname.match(/^\\/agents\\/([^/]+)\\/chat$/);
  if (chatMatch && req.method === 'POST') {
    const agentName = decodeURIComponent(chatMatch[1]!);
    const agent = agents[agentName];

    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: \`Agent '\${agentName}' not found\`, available: agentNames }));
      return;
    }

    try {
      const body = await parseBody(req);
      const parsed = JSON.parse(body) as { message?: string };
      const message = parsed.message ?? '';

      if (!message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "message" field in request body' }));
        return;
      }

      const response = await agent.chat(message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agent: agentName, response }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }));
    }
    return;
  }

  // Agent reset: POST /agents/:name/reset
  const resetMatch = pathname.match(/^\\/agents\\/([^/]+)\\/reset$/);
  if (resetMatch && req.method === 'POST') {
    const agentName = decodeURIComponent(resetMatch[1]!);
    const agent = agents[agentName];

    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: \`Agent '\${agentName}' not found\`, available: agentNames }));
      return;
    }

    agent.resetConversation();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agent: agentName, status: 'conversation reset' }));
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', routes: ['GET /health', 'GET /agents', 'POST /agents/:name/chat', 'POST /agents/:name/reset'] }));
});

server.listen(PORT, () => {
  console.log(\`AgentForge Docker Runtime listening on port \${PORT}\`);
  console.log(\`Agents: \${agentNames.join(', ')}\`);
  console.log(\`Routes: GET /health, GET /agents, POST /agents/:name/chat, POST /agents/:name/reset\`);
});
`;
}

// ─── Package.json Generation ────────────────────────────────────────────────

/**
 * Generate the `package.json` for the Docker runtime project.
 *
 * Includes Vercel AI SDK, provider packages for all models referenced
 * in the assembly, MCP SDK if needed, and TypeScript/build tooling.
 *
 * @param assembly - The Agent Assembly to derive dependencies from.
 * @returns A plain object suitable for JSON serialization as package.json.
 */
export function generatePackageJson(assembly: AgentAssembly): Record<string, unknown> {
  const modelResources = findResources(assembly, 'agentforge::core::Model');
  const mcpResources = findResources(assembly, 'agentforge::core::MCPServer');

  // Determine which provider packages are needed.
  const providers = new Set<string>();
  for (const model of modelResources) {
    const provider = (model.properties as Record<string, unknown>)['provider'] as string | undefined;
    if (provider && PROVIDER_MAP[provider]) {
      providers.add(provider);
    }
  }

  // Default to anthropic if no recognized providers.
  if (providers.size === 0) {
    providers.add('anthropic');
  }

  // Build dependencies.
  const deps: Record<string, string> = {
    'ai': '^4.0.0',
    'zod': '^3.23.0',
  };

  for (const provider of providers) {
    const info = PROVIDER_MAP[provider];
    if (info) {
      deps[info.pkg] = '^1.0.0';
    }
  }

  if (mcpResources.length > 0) {
    deps['@modelcontextprotocol/sdk'] = '^1.0.0';
  }

  return {
    name: `agentforge-docker-${assembly.metadata.stackName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`,
    version: '0.0.1',
    private: true,
    type: 'module',
    scripts: {
      build: 'tsc',
      start: 'node dist/runtime.js',
      'docker:build': 'docker compose build',
      'docker:up': 'docker compose up -d',
      'docker:down': 'docker compose down',
    },
    dependencies: deps,
    devDependencies: {
      typescript: '^5.7.0',
      '@types/node': '^22.0.0',
    },
  };
}
