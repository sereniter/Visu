/**
 * Termination rule per FLOW_EXECUTION_CONTRACT_v1.1:
 * - steps.length >= 1
 * - exactly one step has action === "done"
 * - the last step must be that "done" step
 */

interface StepLike {
  action: string;
}

interface FlowLike {
  steps: StepLike[];
}

export function validateFlowTermination(
  flow: unknown
): { valid: true } | { valid: false; errors: string[] } {
  if (flow === null || typeof flow !== "object" || !Array.isArray((flow as FlowLike).steps)) {
    return { valid: false, errors: ["flow.steps must be an array"] };
  }

  const steps = (flow as FlowLike).steps;

  if (steps.length < 1) {
    return { valid: false, errors: ["flow must contain at least one step"] };
  }

  const doneIndices = steps
    .map((s, i) => (s.action === "done" ? i : -1))
    .filter((i) => i >= 0);

  if (doneIndices.length === 0) {
    return { valid: false, errors: ["flow must contain exactly one 'done' action"] };
  }

  if (doneIndices.length > 1) {
    return { valid: false, errors: ["flow must contain exactly one 'done' action"] };
  }

  const lastIndex = steps.length - 1;
  if (doneIndices[0] !== lastIndex) {
    return { valid: false, errors: ["'done' must be the last step"] };
  }

  return { valid: true };
}
