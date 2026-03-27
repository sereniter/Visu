import { describe, it, expect } from "vitest";
import { validateFlowTermination } from "../src/validators/flow_termination.js";

describe("flow_termination", () => {
  it("accepts flow with single step done", () => {
    const result = validateFlowTermination({
      flow_id: "x",
      version: "1.0",
      steps: [{ step_id: "s1", action: "done" }],
    });
    expect(result.valid).toBe(true);
  });

  it("accepts flow with done as last step", () => {
    const result = validateFlowTermination({
      flow_id: "x",
      version: "1.0",
      steps: [
        { step_id: "s1", action: "navigate", url: "https://example.com" },
        { step_id: "s2", action: "done" },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects flow with no done", () => {
    const result = validateFlowTermination({
      flow_id: "x",
      version: "1.0",
      steps: [
        { step_id: "s1", action: "navigate", url: "https://example.com" },
        { step_id: "s2", action: "click", selector: "#btn" },
      ],
    });
    expect(result.valid).toBe(false);
    expect((result as { errors: string[] }).errors).toContain(
      "flow must contain exactly one 'done' action"
    );
  });

  it("rejects flow with multiple done", () => {
    const result = validateFlowTermination({
      flow_id: "x",
      version: "1.0",
      steps: [
        { step_id: "s1", action: "done" },
        { step_id: "s2", action: "done" },
      ],
    });
    expect(result.valid).toBe(false);
    expect((result as { errors: string[] }).errors).toContain(
      "flow must contain exactly one 'done' action"
    );
  });

  it("rejects flow where done is not last", () => {
    const result = validateFlowTermination({
      flow_id: "x",
      version: "1.0",
      steps: [
        { step_id: "s1", action: "done" },
        { step_id: "s2", action: "click", selector: "#btn" },
      ],
    });
    expect(result.valid).toBe(false);
    expect((result as { errors: string[] }).errors).toContain("'done' must be the last step");
  });

  it("rejects flow with zero steps", () => {
    const result = validateFlowTermination({
      flow_id: "x",
      version: "1.0",
      steps: [],
    });
    expect(result.valid).toBe(false);
    expect((result as { errors: string[] }).errors).toContain(
      "flow must contain at least one step"
    );
  });
});
