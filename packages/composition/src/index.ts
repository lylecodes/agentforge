/**
 * @module @agentforge/composition
 *
 * Multi-agent composition constructs for AgentForge.
 *
 * - {@link Workflow} — sequential/parallel multi-step agent pipelines
 * - {@link Team} — agent groups with orchestration strategies
 * - {@link Router} — conditional dispatch to agents/workflows
 * - {@link Handoff} — agent-to-agent or agent-to-human transfer
 */

export {
  TeamOrchestration,
  RoutingStrategy,
  HandoffTarget,
  HandoffTrigger,
} from './types.js';

export type {
  WorkflowErrorHandling,
  WorkflowStep,
  TeamMember,
  Route,
  ContextTransferConfig,
} from './types.js';
