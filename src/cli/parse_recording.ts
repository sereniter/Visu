/**
 * Parse Playwright codegen output into a v1.5 scene contract (ui_flow_scenes).
 * Splits at window.__VISU_SCENE_END__ = "scene_id" markers and converts statements to steps.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  UIFlowSceneStep,
  UIFlowSceneV15,
  LocatorDescriptor,
} from "../validators/scene_schema.js";

const SCENE_END_RE = /window\.__VISU_SCENE_END__\s*=\s*["']([^"']+)["']/g;

export interface ParseRecordingOptions {
  inputPath: string;
  templateMapPath: string;
  outputPath: string;
  topic: string;
  language: string;
  voiceGender: "male" | "female";
  music: string;
  baseUrl: string;
  /** Optional: intro narration template key (default: {topic}_intro_{language}) */
  introTemplateKey?: string;
  /** Optional: summary narration template key (default: {topic}_summary_{language}) */
  summaryTemplateKey?: string;
  /** Optional: intro asset path (default: visuals/{topic}_intro_12345_1.0.png) */
  introAssetPath?: string;
  /** Optional: summary asset path (default: visuals/{topic}_summary_12345_1.0.png) */
  summaryAssetPath?: string;
}

/** Template map: scene_id -> text_template_key for narration. */
function loadTemplateMap(path: string): Record<string, string> {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, string>;
  return raw;
}

function parseStepsFromChunk(chunk: string, baseUrl: string): UIFlowSceneStep[] {
  const steps: UIFlowSceneStep[] = [];
  const lines = chunk.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip non-action lines
    if (!trimmed.startsWith("await page.") && !trimmed.startsWith("page.")) continue;
    if (trimmed.startsWith("window.__VISU_SCENE_END__")) continue;

    // page.goto(url)
    const gotoMatch = trimmed.match(/page\.goto\s*\(\s*["']([^"']+)["']/);
    if (gotoMatch) {
      let url = gotoMatch[1];
      if (url.startsWith("/")) url = baseUrl.replace(/\/$/, "") + url;
      steps.push({ action: "navigate", url });
      continue;
    }

    // Legacy: page.click('selector')
    const legacyClickMatch = trimmed.match(
      /^await page\.click\s*\(\s*["']((?:[^"']|\\.)*?)["']\s*\)/,
    );
    if (legacyClickMatch) {
      steps.push({ action: "click", selector: legacyClickMatch[1] });
      continue;
    }

    // Legacy: page.fill('selector', 'value')
    const legacyFillMatch = trimmed.match(
      /^await page\.fill\s*\(\s*["']((?:[^"']|\\.)*?)["']\s*,\s*["']((?:[^"']|\\.)*?)["']\s*\)/,
    );
    if (legacyFillMatch) {
      steps.push({
        action: "fill",
        selector: legacyFillMatch[1],
        value: legacyFillMatch[2],
      });
      continue;
    }

    // Modern chained .fill('value') — capture the value and locator
    const chainedFillMatch = trimmed.match(
      /\.fill\s*\(\s*["']((?:[^"']|\\.)*?)["']\s*\)/,
    );
    if (chainedFillMatch) {
      const locator = extractLocatorDescriptor(trimmed);
      steps.push({ action: "fill", locator, value: chainedFillMatch[1] });
      continue;
    }

    // Modern chained .click() — getByRole, getByText, locator, etc.
    if (/\.click\s*\(\s*\)/.test(trimmed)) {
      const locator = extractLocatorDescriptor(trimmed);
      steps.push({ action: "click", locator });
      continue;
    }

    // page.waitForSelector('selector')
    const waitMatch = trimmed.match(
      /page\.waitForSelector\s*\(\s*["']((?:[^"']|\\.)*?)["']/,
    );
    if (waitMatch) {
      steps.push({ action: "wait", selector: waitMatch[1] });
      continue;
    }

    // page.screenshot()
    if (/page\.screenshot\s*\(/.test(trimmed)) {
      steps.push({ action: "screenshot" });
      continue;
    }
  }

  steps.push({ action: "done" });
  return steps;
}

/**
 * Extract a structured locator descriptor from a chained Playwright expression.
 * This preserves the original getByX / locator semantics so the engine can
 * reconstruct native Playwright calls instead of relying on ad-hoc strings.
 */
function extractLocatorDescriptor(line: string): LocatorDescriptor {
  // getByRole('role', { name: 'X' })
  let match = line.match(
    /getByRole\s*\(\s*["']([^"']+)["']\s*,\s*\{\s*name\s*:\s*["']([^"']+)["']/,
  );
  if (match) {
    const desc: LocatorDescriptor = {
      type: "getByRole",
      role: match[1],
      options: { name: match[2] },
    };
    const nthMatch = line.match(/\.nth\s*\((\d+)\)/);
    if (nthMatch) {
      desc.nth = Number.parseInt(nthMatch[1], 10);
    } else if (/\.first\s*\(\s*\)/.test(line)) {
      desc.nth = 0;
    }
    return desc;
  }

  // getByRole('role')
  match = line.match(/getByRole\s*\(\s*["']([^"']+)["']/);
  if (match) {
    const desc: LocatorDescriptor = { type: "getByRole", role: match[1] };
    const nthMatch = line.match(/\.nth\s*\((\d+)\)/);
    if (nthMatch) {
      desc.nth = Number.parseInt(nthMatch[1], 10);
    } else if (/\.first\s*\(\s*\)/.test(line)) {
      desc.nth = 0;
    }
    return desc;
  }

  // getByText('text')
  match = line.match(/getByText\s*\(\s*["']([^"']+)["']/);
  if (match) {
    return { type: "getByText", text: match[1] };
  }

  // getByLabel('label')
  match = line.match(/getByLabel\s*\(\s*["']([^"']+)["']/);
  if (match) {
    return { type: "getByLabel", text: match[1] };
  }

  // getByPlaceholder('placeholder')
  match = line.match(/getByPlaceholder\s*\(\s*["']([^"']+)["']/);
  if (match) {
    return { type: "getByPlaceholder", text: match[1] };
  }

  // locator('selector').filter({ hasText: ... }).nth(N)
  match = line.match(/locator\s*\(\s*["']([^"']+)["']/);
  if (match) {
    const desc: LocatorDescriptor = {
      type: "locator",
      selector: match[1],
    };
    const hasTextMatch = line.match(/hasText\s*:\s*["']([^"']+)["']/);
    if (hasTextMatch) {
      desc.filter = { hasText: hasTextMatch[1] };
    }
    const hasTextRegex = line.match(/hasText\s*:\s*\/([^/]+)\//);
    if (hasTextRegex) {
      desc.filter = { hasText: hasTextRegex[1] };
    }
    const nthMatch = line.match(/\.nth\s*\((\d+)\)/);
    if (nthMatch) {
      desc.nth = Number.parseInt(nthMatch[1], 10);
    } else if (/\.first\s*\(\s*\)/.test(line)) {
      desc.nth = 0;
    }
    return desc;
  }

  // Fallback: keep as generic locator with unknown selector.
  return { type: "locator", selector: "unknown" };
}

/**
 * Split codegen JS by __VISU_SCENE_END__ markers and parse each chunk into steps.
 * Returns array of { sceneId, steps }. If no markers, returns one scene with id "s1_main".
 */
function splitAndParseScenes(codegenContent: string, baseUrl: string): { sceneId: string; steps: UIFlowSceneStep[] }[] {
  const parts: string[] = [];
  let lastIndex = 0;
  const sceneIds: string[] = [];
  let match: RegExpExecArray | null;
  SCENE_END_RE.lastIndex = 0;
  while ((match = SCENE_END_RE.exec(codegenContent)) !== null) {
    sceneIds.push(match[1]);
    parts.push(codegenContent.slice(lastIndex, match.index));
    lastIndex = SCENE_END_RE.lastIndex;
  }
  const tail = codegenContent.slice(lastIndex).trim();
  if (tail && /[\w]/.test(tail)) {
    parts.push(codegenContent.slice(lastIndex));
    if (sceneIds.length === 0) {
      sceneIds.push("s1_main");
    } else {
      sceneIds.push(`s${sceneIds.length + 1}_tail`);
    }
  }

  if (parts.length === 0) {
    return [{ sceneId: "s1_main", steps: parseStepsFromChunk(codegenContent, baseUrl) }];
  }

  return parts.map((chunk, i) => ({
    sceneId: sceneIds[i] ?? `s${i + 1}`,
    steps: parseStepsFromChunk(chunk, baseUrl),
  }));
}

export function runParseRecording(options: ParseRecordingOptions): void {
  const {
    inputPath,
    templateMapPath,
    outputPath,
    topic,
    language,
    voiceGender,
    music,
    baseUrl,
    introTemplateKey,
    summaryTemplateKey,
    introAssetPath,
    summaryAssetPath,
  } = options;

  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  if (!existsSync(templateMapPath)) {
    throw new Error(`Template map file not found: ${templateMapPath}`);
  }

  const codegenContent = readFileSync(inputPath, "utf-8");
  const templateMap = loadTemplateMap(templateMapPath);
  const parsed = splitAndParseScenes(codegenContent, baseUrl);

  const videoId = `${topic}_${language}`;
  const introKey = introTemplateKey ?? `${topic}_intro_${language}`;
  const summaryKey = summaryTemplateKey ?? `${topic}_summary_${language}`;
  const introAsset = introAssetPath ?? `visuals/${topic}_intro_12345_1.0.png`;
  const summaryAsset = summaryAssetPath ?? `visuals/${topic}_summary_12345_1.0.png`;

  const scenes: UIFlowSceneV15[] = parsed.map((p, i) => {
    const templateKey = templateMap[p.sceneId] ?? `${topic}_scene_${i + 1}_${language}`;
    return {
      scene_id: p.sceneId,
      title: `Step ${i + 1}: ${p.sceneId.replace(/^s\d+_/, "").replace(/_/g, " ")}`,
      narration: {
        text_template_key: templateKey,
        language,
        voice_gender: voiceGender,
        speed: 1.0,
      },
      buffer_sec: 2,
      music,
      steps: p.steps,
    };
  });

  const contract = {
    schema_version: "1.6",
    video_id: videoId,
    topic,
    language,
    mode: "ui_flow_scenes",
    baseUrl,
    intro: {
      scene_id: "s0_intro",
      asset_path: introAsset,
      prompt_key: `${topic}_intro`,
      seed: 12345,
      model_version: "1.0",
      narration: {
        text_template_key: introKey,
        language,
        voice_gender: voiceGender,
        speed: 1.0,
      },
      buffer_sec: 1,
      music,
    },
    summary: {
      scene_id: "s_summary",
      asset_path: summaryAsset,
      prompt_key: `${topic}_summary`,
      seed: 12345,
      model_version: "1.0",
      narration: {
        text_template_key: summaryKey,
        language,
        voice_gender: voiceGender,
        speed: 1.0,
      },
      buffer_sec: 1,
      music,
    },
    recording_enhancements: {
      clickSound: true,
      clickHighlight: true,
      highlightColor: "#FF6B35",
      highlightDurationMs: 600,
      cursorHighlight: true,
      ambientSounds: true,
      zoomToAction: true,
      zoomLevel: 0.18,
    },
    post_production: {
      stepTitleCard: true,
      progressIndicator: true,
      transitionSound: true,
      chapterMarkers: true,
      subtitleTrack: true,
      thumbnail: true,
      videoDescription: true,
    },
    scenes,
  };

  const outDir = dirname(outputPath);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(contract, null, 2), "utf-8");
}
