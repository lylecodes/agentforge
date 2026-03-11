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

export { Workflow } from './workflow.js';
export type { WorkflowProps } from './workflow.js';

export { Team } from './team.js';
export type { TeamProps } from './team.js';

export { Router } from './router.js';
export type { RouterProps } from './router.js';

export { Handoff } from './handoff.js';
export type { HandoffProps } from './handoff.js';
