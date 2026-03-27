import { describe, it, expect } from "vitest";
import { validateFlow } from "../src/validators/flow_schema.js";

describe("flow_schema_v1", () => {
  it("accepts valid flow", () => {
    const result = validateFlow({
      flow_id: "onboarding",
      version: "1.0",
      steps: [
        { step_id: "s1", action: "navigate", url: "https://example.com" },
        { step_id: "s2", action: "click", selector: "#btn" },
        { step_id: "s3", action: "done" },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects flow missing flow_id", () => {
    const result = validateFlow({
      version: "1.0",
      steps: [{ step_id: "s1", action: "done" }],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects flow with invalid action type", () => {
    const result = validateFlow({
      flow_id: "x",
      version: "1.0",
      steps: [{ step_id: "s1", action: "invalid_action" }],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects flow with additional properties at root", () => {
    const result = validateFlow({
      flow_id: "x",
      version: "1.0",
      steps: [],
      extra: "forbidden",
    });
    expect(result.valid).toBe(false);
  });
});
