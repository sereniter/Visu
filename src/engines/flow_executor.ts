/**
 * FlowExecutor – conforms to docs/FLOW_EXECUTION_CONTRACT_v1.1.md
 * Does not import Playwright; uses IUIFlowAdapter only.
 */

import type { RunContext } from "../core/run_context.js";
import type { FlowStep, IUIFlowAdapter } from "../core/ui_flow_adapter_interface.js";

export interface ValidatedFlow {
  flow_id: string;
  version: string;
  steps: FlowStep[];
}

type Logger = {
  log: (step: string, options?: { message?: string; payload?: object }) => void;
};

export async function runFlow(params: {
  flow: ValidatedFlow;
  context: RunContext;
  logger: Logger;
  adapter: IUIFlowAdapter;
}): Promise<RunContext> {
  const { flow, context, logger, adapter } = params;
  const steps = flow.steps;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    logger.log("step_started", { payload: { step_id: step.step_id, action: step.action } });

    try {
      await adapter.executeStep(step);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.log("step_failed", {
        message,
        payload: { step_id: step.step_id, action: step.action, error: message },
      });
      context.status = "failed";
      context.error = { stage: "step", message, stack };
      const rawVideoPath = await adapter.close(context.runId);
      if (rawVideoPath) context.artifacts.rawVideoPath = rawVideoPath;
      return context;
    }

    logger.log("step_completed", { payload: { step_id: step.step_id, action: step.action } });

    if (step.action === "done") {
      logger.log("flow_completed", { payload: { flow_id: flow.flow_id, version: flow.version } });
      context.status = "completed";
      const rawVideoPath = await adapter.close(context.runId);
      if (rawVideoPath) context.artifacts.rawVideoPath = rawVideoPath;
      return context;
    }
  }

  return context;
}
