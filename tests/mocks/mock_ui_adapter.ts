import type { FlowStep, IUIFlowAdapter } from "../../src/core/ui_flow_adapter_interface.js";

export interface MockUIFlowAdapterOptions {
  /** If set, executeStep will throw when this step_id is executed. */
  failOnStepId?: string | null;
  /** Path returned by close(). Defaults to artifacts/{runId}/raw.webm. */
  closeReturnPath?: string | null;
}

export class MockUIFlowAdapter implements IUIFlowAdapter {
  private failOnStepId: string | null;
  private closeReturnPath: string | null;
  private stepsExecuted: string[] = [];

  constructor(options: MockUIFlowAdapterOptions = {}) {
    this.failOnStepId = options.failOnStepId ?? null;
    this.closeReturnPath = options.closeReturnPath ?? null;
  }

  getStepsExecuted(): string[] {
    return [...this.stepsExecuted];
  }

  async executeStep(step: FlowStep): Promise<void> {
    this.stepsExecuted.push(step.step_id);
    if (this.failOnStepId !== null && step.step_id === this.failOnStepId) {
      throw new Error("mock failure");
    }
  }

  async close(runId: string): Promise<string | undefined> {
    if (this.closeReturnPath !== null) return this.closeReturnPath;
    return `artifacts/${runId}/raw.webm`;
  }
}
