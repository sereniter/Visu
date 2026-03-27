import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  computeFileSha256,
  buildMediaMetadata,
  writeMediaMetadata,
  copyOutputToRepository,
} from "../src/engines/metadata_writer.js";
import { getConfig, setConfigForTest } from "../src/core/config.js";
import type { MediaMetadataPayload } from "../src/validators/media_metadata_schema.js";

describe("computeFileSha256", () => {
  it("returns hex hash of file contents", () => {
    const dir = mkdtempSync(join(tmpdir(), "visu-meta-"));
    const f = join(dir, "f.bin");
    writeFileSync(f, "hello");
    const hash = computeFileSha256(f);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("buildMediaMetadata", () => {
  it("builds object with duckingDb -14", () => {
    const m = buildMediaMetadata({
      runId: "r1",
      mode: "recorded",
      encodingProfileVersion: "v1",
      ffmpegVersion: "6.0",
      ffmpegBinaryFingerprint: "abc",
      sourceVideoPath: "/r.webm",
      narrationPath: "/n.wav",
      musicPath: null,
      musicLufs: null,
      durationMs: 5000,
      driftMs: 0,
      crf: 18,
      audioSampleRate: 48000,
      outputPath: "/out/final.mp4",
      outputSha256: "abc",
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    expect(m.duckingDb).toBe(-14);
    expect(m.runId).toBe("r1");
    expect(m.mode).toBe("recorded");
    expect(m.musicPath).toBe(null);
  });

  it("includes sceneCount, maxDriftMs, avgDriftMs for Mode C", () => {
    const m = buildMediaMetadata({
      runId: "r1",
      mode: "generative",
      encodingProfileVersion: "v1",
      ffmpegVersion: "6.0",
      ffmpegBinaryFingerprint: "abc",
      sourceVideoPath: "/stitched.mp4",
      narrationPath: "/stitched_narration.wav",
      musicPath: null,
      musicLufs: null,
      durationMs: 10000,
      driftMs: 10,
      crf: 18,
      audioSampleRate: 48000,
      outputPath: "/out/final.mp4",
      outputSha256: "abc",
      generatedAt: "2025-01-01T00:00:00.000Z",
      sceneCount: 2,
      maxDriftMs: 12,
      avgDriftMs: 7,
    });
    expect(m.mode).toBe("generative");
    expect(m.sceneCount).toBe(2);
    expect(m.maxDriftMs).toBe(12);
    expect(m.avgDriftMs).toBe(7);
  });
});

describe("writeMediaMetadata", () => {
  it("writes valid JSON and validates against schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "visu-meta-"));
    const outPath = join(dir, "final.mp4");
    const metaPath = join(dir, "media_metadata.json");
    writeFileSync(outPath, "fake mp4 content");

    const { metadata, metadataHash } = writeMediaMetadata(outPath, metaPath, {
      runId: "r1",
      mode: "recorded",
      encodingProfileVersion: "v1",
      ffmpegVersion: "6.0",
      ffmpegBinaryFingerprint: "test-ffmpeg-fingerprint-sha256",
      sourceVideoPath: "/r.webm",
      narrationPath: "/n.wav",
      musicPath: null,
      musicLufs: null,
      durationMs: 5000,
      driftMs: 0,
      crf: 18,
      audioSampleRate: 48000,
      generatedAt: "2025-01-01T00:00:00.000Z",
    });

    expect(metadata.outputSha256).toBeDefined();
    expect(metadata.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(metadataHash).toMatch(/^[a-f0-9]{64}$/);
    const written = readFileSync(metaPath, "utf-8");
    const parsed = JSON.parse(written);
    expect(parsed.runId).toBe("r1");
    expect(parsed.duckingDb).toBe(-14);
  });
});

describe("copyOutputToRepository", () => {
  let tmpRoot: string;
  const logger = { log: () => {} };

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "visu-copy-out-"));
    const config = getConfig();
    setConfigForTest({
      ...config,
      contentRoot: join(tmpRoot, "recipes"),
      outputRoot: join(tmpRoot, "menu_item"),
    });
    mkdirSync(join(tmpRoot, "menu_item"), { recursive: true });
  });

  afterEach(() => {
    setConfigForTest(null);
    try {
      rmSync(tmpRoot, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("copies final.mp4 and media_metadata.json and verifies SHA256", () => {
    const dir = mkdtempSync(join(tmpdir(), "visu-artifacts-"));
    const finalPath = join(dir, "final.mp4");
    const metaPath = join(dir, "media_metadata.json");
    writeFileSync(finalPath, "fake mp4 content");
    const outputSha256 = computeFileSha256(finalPath);
    const metadata: MediaMetadataPayload = {
      runId: "r1",
      mode: "recorded",
      encodingProfileVersion: "v1",
      ffmpegVersion: "6.0",
      ffmpegBinaryFingerprint: "fp",
      sourceVideoPath: "/r",
      narrationPath: "/n",
      musicPath: null,
      musicLufs: null,
      durationMs: 5000,
      driftMs: 0,
      crf: 18,
      audioSampleRate: 48000,
      duckingDb: -14,
      outputPath: finalPath,
      outputSha256,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    const destPath = copyOutputToRepository({
      finalVideoPath: finalPath,
      metadataPath: metaPath,
      metadata,
      topic: "login_flow",
      language: "en",
      logger,
    });

    expect(destPath).toMatch(/login_flow[\\/]en[\\/]final\.mp4$/);
    expect(readFileSync(destPath, "utf-8")).toBe("fake mp4 content");
    const destMeta = join(dirname(destPath), "media_metadata.json");
    expect(existsSync(destMeta)).toBe(true);
  });

  it("throws when copied file SHA256 does not match metadata.outputSha256", () => {
    const dir = mkdtempSync(join(tmpdir(), "visu-artifacts-"));
    const finalPath = join(dir, "final.mp4");
    const metaPath = join(dir, "media_metadata.json");
    writeFileSync(finalPath, "fake mp4 content");
    const metadata: MediaMetadataPayload = {
      runId: "r1",
      mode: "recorded",
      encodingProfileVersion: "v1",
      ffmpegVersion: "6.0",
      ffmpegBinaryFingerprint: "fp",
      sourceVideoPath: "/r",
      narrationPath: "/n",
      musicPath: null,
      musicLufs: null,
      durationMs: 5000,
      driftMs: 0,
      crf: 18,
      audioSampleRate: 48000,
      duckingDb: -14,
      outputPath: finalPath,
      outputSha256: "0".repeat(64),
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    expect(() =>
      copyOutputToRepository({
        finalVideoPath: finalPath,
        metadataPath: metaPath,
        metadata,
        topic: "login_flow",
        language: "en",
        logger,
      })
    ).toThrow(/SHA256 mismatch/);
  });
});
