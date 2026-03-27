import { describe, expect, it, vi } from "vitest";
import { RemotionAdapter } from "../src/adapters/remotion_adapter.js";

const makeLogger = () => ({
  log: vi.fn(),
});

describe("RemotionAdapter", () => {
  it("throws REMOTION_TEMPLATES_NOT_FOUND when templatesRoot does not exist", async () => {
    const logger = makeLogger();
    const adapter = new RemotionAdapter(
      "/this/path/does/not/exist",
      logger,
    );

    await expect(
      adapter.renderIntro({
        title: "T",
        subtitle: "S",
        language: "en",
        stepCount: 3,
        outputPath: "out.mp4",
      }),
    ).rejects.toThrow(/REMOTION_TEMPLATES_NOT_FOUND/);
  });
});

