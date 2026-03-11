# AgentForge Roadmap

Define Agents as Code. Forge Them to Any Runtime.

Full technical architecture: [roadmap-v2.md](../research/agents-as-code/roadmap-v2.md)

---

## Status

- [x] Phase 1 — Foundation + Core + Local Target
- [x] Phase 2 — Docker Target + Protocol Artifacts
- [ ] Phase 3 — Composition
- [ ] Phase 4 — Governance + Full State
- [ ] Phase 5 — Data + Integration
- [ ] Phase 6 — Advanced Targets
- [ ] Phase 7 — Infrastructure + Production Features
- [ ] Phase 8 — Community + Ecosystem
- [ ] Launch Prep — Dogfood, README, npm, Demo, Social

---

## Phase 1: Foundation + Core + Local Target [COMPLETE]

5 packages, 564 tests, e2e pipeline wired.

- [x] Monorepo scaffolding (pnpm, Turborepo, Vitest, Changesets)
- [x] `@agentforge/constructs` — App, Stack, AgentResourceBase, tokens, validation, assembly IR, aspects, protocols, secrets, assets, error codes
- [x] `@agentforge/core` — Agent, Model, Tool, Prompt, MCPServer, defineAgent()
- [x] `@agentforge/state` — StateManager, diffing, hashing
- [x] `@agentforge/target-local` — LocalTargetCompiler, Vercel AI SDK codegen
- [x] `@agentforge/cli` — init, build, preview, deploy, status, destroy, diff
- [x] E2e flow: `agentforge init` -> `build` -> `deploy`
- [x] Git repo + GitHub (https://github.com/lylecodes/agentforge)

---

## Phase 2: Docker Target + Protocol Artifacts [COMPLETE]

6 packages, 691 tests. Same agent definition compiles to local + Docker.

- [x] **DockerTarget** (`@agentforge/target-docker`) — Dockerfile, docker-compose.yml, HTTP runtime, MCP sidecars, .env.example
- [x] **A2A Agent Card generation** — full implementation with skills, inputSchema, provider info
- [x] **Agent Skills manifest generation** — full implementation with tool schemas, deduplication
- [x] **Memory construct** — 4 types (conversation, summary, entity, buffer), 3 backends, `agent.addMemory()`
- [x] **Schema construct** — JSON Schema + Zod support, `agent.setOutputSchema()`, `agent.setInputSchema()`
- [x] **ITargetCompiler extracted** to `@agentforge/constructs` for target-agnostic sharing
- [x] **defineAgent()** updated with memory option

---

## Phase 3: Composition

Multi-agent systems — workflows, teams, routing, handoffs.

- [ ] **`@agentforge/composition` package**
  - [ ] **Workflow** — sequential/parallel multi-step agent pipelines, error handling (retry/skip/abort)
  - [ ] **Team** — agent groups with orchestration strategies (hierarchical/collaborative/sequential)
  - [ ] **Router** — conditional dispatch (rule-based or LLM-based) with default routes
  - [ ] **Handoff** — agent-to-agent or agent-to-human transfer with context transfer
- [ ] **Connection resources in assembly IR** — explicit edges with data mapping, turning the IR into a proper graph
- [ ] **`agentforge import`** — import existing agents from CrewAI YAML, LangGraph, Mastra configs
- [ ] Update LocalTarget + DockerTarget to compile composition constructs

**Demo:** 3-agent content pipeline (researcher -> writer -> editor) with routing and handoffs.

---

## Phase 4: Governance + Full State

Production-grade guardrails, policies, and Terraform-like state lifecycle.

- [ ] **`@agentforge/governance` package**
  - [ ] **Guardrail** — input/output validation (PII redaction, topic denial, grounding checks)
  - [ ] **Policy** — operational constraints (allow/deny statements, budget limits, usage quotas)
  - [ ] **Evaluation** — quality gates (LLM judge, rule-based, custom metrics, deploy blocking)
  - [ ] **Monitor** — observability (alerts, tracing via OpenTelemetry, dashboards)
- [ ] **Aspects for governance** — visitor pattern to auto-apply guardrails/policies to all agents in scope
- [ ] **Full state management**
  - [ ] State locking (prevent concurrent operations)
  - [ ] Drift detection (compare desired vs deployed state)
  - [ ] Remote state backends (S3, database) — pluggable interface
- [ ] **Cost estimation engine** — `agentforge cost estimate` with per-model pricing, token projections, infra costs
- [ ] **Environment management** — dev/staging/prod stacks, config overrides, `agentforge promote dev -> staging`

**Demo:** `agentforge plan` shows additions/changes/deletions. Guardrails auto-applied via Aspects. Cost estimate before deploy.

---

## Phase 5: Data + Integration

Knowledge bases, vector stores, full MCP, webhooks, channels.

- [ ] **`@agentforge/data` package**
  - [ ] **KnowledgeBase** — document collections for RAG (S3, web crawler, local directory sources)
  - [ ] **VectorStore** — pluggable engines (ChromaDB, Pinecone, pgvector, Weaviate)
  - [ ] **Schema** enhancements — cross-construct validation (embedding dimensions match vector store, agent output matches downstream input)
- [ ] **Full MCPServer** — SSE + streamable-http transports, OAuth/bearer auth, tool filtering, auto-discovery at build time
- [ ] **Webhook** — outbound HTTP notifications on agent events, retry policies, HMAC signing
- [ ] **Channel** — bidirectional platform integration (Slack, Discord, Teams, email)
- [ ] Cross-construct schema validation pass during synthesis

**Demo:** RAG agent with ChromaDB, MCP tools, Slack channel, schema-validated JSON output.

---

## Phase 6: Advanced Targets

The multi-runtime proof. Same definition compiles to 7+ targets.

- [ ] **CrewAI target** (`@agentforge/target-crewai`) — TS -> Python cross-compilation, agents.yaml + tasks.yaml + crew.py
- [ ] **LangGraph target** (`@agentforge/target-langgraph`) — StateGraph definitions, conditional edges, checkpointing
- [ ] **Cloudflare Workers target** (`@agentforge/target-cloudflare`) — Durable Objects, wrangler.toml, edge deployment
- [ ] **Vercel target** (`@agentforge/target-vercel`) — AI SDK routes, serverless functions, Vercel config
- [ ] **Kubernetes target** (`@agentforge/target-kubernetes`) — Deployments, Services, ConfigMaps, Secrets, HPA, PVCs, Ingress
- [ ] **AWS Bedrock target** (`@agentforge/target-bedrock`) — Bedrock Agent definitions, Lambda action groups, CloudFormation
- [ ] **Azure AI Agent target** (`@agentforge/target-azure`) — Azure AI Agent Service, Managed Identity, Bicep templates

**Demo:** Same 3-agent team deployed to local, Docker, CrewAI, LangGraph, and Cloudflare. Five targets, one definition.

---

## Phase 7: Infrastructure + Production Features

Enterprise-grade resources and reusable construct libraries.

- [ ] **Infrastructure constructs**
  - [ ] **Runtime** — compute requirements (CPU, memory, GPU), scaling config
  - [ ] **Gateway** — API exposure (REST/WebSocket/MCP/gRPC), auth, rate limiting
  - [ ] **Registry** — agent discovery via A2A protocol
  - [ ] **Queue** — async task processing (FIFO/priority), DLQ, concurrency
- [ ] **Publishable construct libraries** — L3 constructs on npm (`agentforge-construct` keyword)
  - [ ] `agentforge construct validate` CLI command
  - [ ] Packaging guidelines + template repo
- [ ] **jsii evaluation** — multi-language bindings (Python, Go, Java) from TypeScript source
- [ ] **GitHub Actions CI** — reusable workflows for build, test, deploy in user projects

**Demo:** Custom `CustomerSupportAgent` construct published to npm, consumed in another project with one import.

---

## Phase 8: Community + Ecosystem

- [ ] **Construct registry** — curated catalog -> searchable website (like constructs.dev)
- [ ] **Plugin system** — formalized target plugin interface, auto-discovery, test harness
- [ ] **Documentation site** — Starlight/Docusaurus, progressive learning path (Tier 1-4), API reference, error code reference
- [ ] **Example constructs library** (`@agentforge/examples`) — CustomerSupportAgent, ContentPipeline, CodeReviewTeam, RAGAgent, MCPToolAgent, GovernedAgent
- [ ] **Community infrastructure** — issue/PR templates, contributing guide, code of conduct, RFC process, Discord

---

## Launch Prep (after Phase 8)

Ship when the product is complete and proven.

- [ ] **Dogfood end-to-end** — real agents, real API keys, real LLM conversations across multiple targets
- [ ] **README** — elevator pitch, quick-start (`npx agentforge init`), architecture diagram, target matrix
- [ ] **npm publish** — all packages as `0.1.0` (or `1.0.0` if API is stable)
- [ ] **Demo GIF** — 30-second terminal recording: define agent in 10 lines, deploy to 3 targets
- [ ] **Social media launch**
  - [ ] Twitter/X thread with GIF
  - [ ] Hacker News Show HN post
  - [ ] Reddit r/typescript, r/MachineLearning, r/LangChain
  - [ ] Dev.to or blog post: "Why I Built the Terraform for AI Agents"
- [ ] **GitHub polish** — topics, social preview image, releases page, discussions enabled

---

## Continuous (all phases)

- [ ] Testing — unit, snapshot, integration, contract tests for every package
- [ ] Error messages — clear diagnostics with AF error codes, construct paths, suggested fixes, docs links
- [ ] Documentation — inline TSDoc, keep CLAUDE.md current
- [ ] Dogfooding — use AgentForge to build real agents throughout development
