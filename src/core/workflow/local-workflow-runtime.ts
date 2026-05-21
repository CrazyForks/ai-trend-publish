import {
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowRuntime,
} from "./workflow-runtime.ts";
import { MetricsCollector } from "@src/core/workflow/workflow-metrics.ts";
import { WorkflowStep } from "@src/core/workflow/workflow-step.ts";

export class LocalWorkflowRuntime implements WorkflowRuntime {
  constructor(
    private readonly metricsCollector = new MetricsCollector(),
  ) {}

  async run<TInput, TOutput>(
    workflow: WorkflowDefinition<TInput, TOutput>,
    event: WorkflowEvent<TInput>,
  ): Promise<TOutput> {
    this.metricsCollector.startWorkflow(workflow.id, event.id);
    const step = new WorkflowStep(
      "local-step-execution",
      this.metricsCollector,
      workflow.id,
      event.id,
    );

    try {
      const result = await workflow.run(event, step);
      this.metricsCollector.endWorkflow(workflow.id, event.id);
      return result;
    } catch (error) {
      this.metricsCollector.endWorkflow(workflow.id, event.id, error as Error);
      throw error;
    }
  }
}
