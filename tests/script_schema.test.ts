import { describe, it, expect } from "vitest";
import { validateScript } from "../src/validators/script_schema.js";

describe("script_schema", () => {
  it("accepts a valid script", () => {
    const result = validateScript({
      version: "1.0",
      language: "te",
      text: "Some Telugu narration text",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing text", () => {
    const result = validateScript({
      version: "1.0",
      language: "te",
    });
    expect(result.valid).toBe(false);
  });
});

