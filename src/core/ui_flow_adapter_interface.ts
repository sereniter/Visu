/**
 * Adapter contract for UI flow execution.
 * FlowExecutor depends only on this interface; no Playwright in core/engines.
 */

export type FlowStepAction =
  | "navigate"
  | "click"
  | "fill"
  | "wait"
  | "screenshot"
  | "done";

export interface FlowStep {
  step_id: string;
  action: FlowStepAction;
  url?: string;
  selector?: string;
  value?: string;
  timeout_ms?: number;
}

export interface IUIFlowAdapter {
  executeStep(step: FlowStep): Promise<void>;
  close(runId: string): Promise<string | undefined>;
}
