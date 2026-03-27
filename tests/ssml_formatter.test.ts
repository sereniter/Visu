import { describe, it, expect } from "vitest";
import { toSsml } from "../src/core/ssml_formatter.js";

describe("toSsml", () => {
  it("wraps text in speak and prosody", () => {
    const out = toSsml("Hello world", 1.0);
    expect(out).toContain("<speak>");
    expect(out).toContain("</speak>");
    expect(out).toContain("<prosody rate=\"100%\">");
    expect(out).toContain("</prosody>");
    expect(out).toContain("Hello world");
  });

  it("applies speech rate as percentage", () => {
    expect(toSsml("Hi", 0.95)).toContain('rate="95%"');
    expect(toSsml("Hi", 1.1)).toContain('rate="110%"');
  });

  it("inserts break after punctuation", () => {
    const out = toSsml("Hello. World!", 1.0);
    expect(out).toContain('<break time="200ms"/>');
    const breakCount = (out.match(/<break time="200ms"\/>/g) ?? []).length;
    expect(breakCount).toBe(2); // after . and after !
  });

  it("escapes XML in text", () => {
    const out = toSsml("A < B & C", 1.0);
    expect(out).not.toContain("< B");
    expect(out).toContain("&lt;");
    expect(out).toContain("&amp;");
  });

  it("is deterministic for same input", () => {
    const a = toSsml("Same text.", 0.9);
    const b = toSsml("Same text.", 0.9);
    expect(a).toBe(b);
  });
});
