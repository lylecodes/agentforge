/**
 * @module workflow
 *
 * Workflow construct — sequential multi-step agent pipeline.
 *
 * A Workflow defines an ordered list of steps, where each step invokes an
 * Agent with a task instruction. The output of step N feeds into step N+1.
 * Creates `workflow_step` connections in the assembly IR.
 *
 * @example
 * ```typescript
 * const pipeline = new Workflow(stack, 'ContentPipeline', {
 *   steps: [
 *     { agent: researcher, task: 'Research the topic: {topic}' },
 *     { agent: writer, task: 'Write an article based on: {research_output}' },
 *     { agent: editor, task: 'Edit and polish: {draft_output}' },
 *   ],
 *   errorHandling: 'retry',
 *   maxRetries: 2,
 * });
 * ```
 */

import { Construct } from 'constructs';
import { AgentResourceBase, Stack } from '@agentforge/constructs';
import type { AgentForgeDiagnostic, Connection } from '@agentforge/constructs';
import type { WorkflowStep, WorkflowErrorHandling } from './types.js';

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * Configuration properties for a {@link Workflow} construct.
 */
export interface WorkflowProps {
  /** Ordered list of steps. Each step invokes an agent with a task. */
  readonly steps: WorkflowStep[];

  /** Error handling strategy (default: 'abort'). */
  readonly errorHandling?: WorkflowErrorHandling;

  /** Maximum retries per step when errorHandling is 'retry' (default: 1). */
  readonly maxRetries?: number;

  /**
   * Data mapping between steps.
   * Key format: `"<stepName>-><targetStepIndex>"` or `"<sourceIndex>-><targetIndex>"`.
   * Value: `{ sourceOutputField: targetInputField }`.
   */
  readonly dataMapping?: Record<string, Record<string, string>>;

  /** Human-readable description of this workflow. */
  readonly description?: string;
}

// ─── Resource Type ──────────────────────────────────────────────────────────

const WORKFLOW_RESOURCE_TYPE = 'agentforge::composition::Workflow';

// ─── Construct ──────────────────────────────────────────────────────────────

/**
 * A sequential multi-step agent pipeline.
 *
 * Workflows define ordered steps where each agent processes and passes
 * results to the next. The construct creates `workflow_step` connections
 * in the assembly IR describing the data flow graph.
 */
export class Workflow extends AgentResourceBase {
  /** The ordered steps. */
  public readonly steps: WorkflowStep[];

  /** Error handling strategy. */
  public readonly errorHandling: WorkflowErrorHandling;

  /** Max retries per step. */
  public readonly maxRetries: number;

  /** Data mappings between steps. */
  public readonly dataMapping: Record<string, Record<string, string>>;

  /** Workflow description. */
  public readonly workflowDescription?: string;

  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id, WORKFLOW_RESOURCE_TYPE);

    this.steps = [...props.steps];
    this.errorHandling = props.errorHandling ?? 'abort';
    this.maxRetries = props.maxRetries ?? 1;
    this.dataMapping = props.dataMapping ?? {};
    this.workflowDescription = props.description;

    // Register dependencies on all step agents.
    for (const step of this.steps) {
      this.addDependency(step.agent);
    }

    // Create workflow_step connections between consecutive steps.
    this.registerConnections(scope);
  }

  /**
   * Register workflow_step connections in the parent Stack.
   */
  private registerConnections(scope: Construct): void {
    const stack = this.findStack(scope);
    if (!stack) return;

    for (let i = 0; i < this.steps.length - 1; i++) {
      const source = this.steps[i]!;
      const target = this.steps[i + 1]!;

      // Look up data mapping for this edge.
      const mappingKey = source.name
        ? `${source.name}->${i + 1}`
        : `${i}->${i + 1}`;
      const dataMapping = this.dataMapping[mappingKey];

      const connection: Connection = {
        id: `${this.node.path}/step-${i}-to-${i + 1}`,
        source: source.agent.node.path,
        target: target.agent.node.path,
        type: 'workflow_step',
        order: i,
        ...(dataMapping ? { dataMapping } : {}),
      };

      stack.addConnection(connection);
    }
  }

  /**
   * Find the parent Stack by walking up the construct tree.
   */
  private findStack(scope: Construct): Stack | null {
    let current: Construct | undefined = scope instanceof Stack ? scope : undefined;
    if (!current) {
      // Walk up
      let node = scope;
      while (node) {
        if (Stack.isStack(node)) {
          current = node;
          break;
        }
        const parent = node.node.scope;
        if (!parent || !(parent instanceof Construct)) break;
        node = parent;
      }
    }
    return (current as Stack) ?? null;
  }

  // ─── Validation ──────────────────────────────────────────────────────

  validate(): AgentForgeDiagnostic[] {
    const diagnostics = super.validate();

    if (this.steps.length < 2) {
      diagnostics.push({
        code: 'AF601',
        severity: 'error',
        message: `Workflow '${this.displayName}' requires at least 2 steps, got ${this.steps.length}.`,
        constructPath: this.node.path,
        suggestedFix: 'Add at least 2 steps to the Workflow construct.',
        docsUrl: 'https://agentforge.dev/docs/errors/AF601',
      });
    }

    return diagnostics;
  }

  // ─── Serialization ──────────────────────────────────────────────────

  protected resolveProperties(): Record<string, unknown> {
    const props: Record<string, unknown> = {
      steps: this.steps.map((step, i) => ({
        agentPath: step.agent.node.path,
        agentName: step.agent.agentName,
        task: step.task,
        name: step.name ?? `step-${i}`,
        order: i,
      })),
      errorHandling: this.errorHandling,
      maxRetries: this.maxRetries,
    };

    if (this.workflowDescription) {
      props.description = this.workflowDescription;
    }

    if (Object.keys(this.dataMapping).length > 0) {
      props.dataMapping = this.dataMapping;
    }

    return props;
  }
}
