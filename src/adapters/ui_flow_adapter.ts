/**
 * UI Flow Adapter – conforms to docs/FLOW_EXECUTION_CONTRACT_v1.1.md
 * This is the only place that imports Playwright.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { copyFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "../core/config.js";
import type { FlowStep, IUIFlowAdapter } from "../core/ui_flow_adapter_interface.js";

const ANIMATION_DISABLE_CSS = `
* { animation: none !important; transition: none !important; }
`;

export class UIFlowAdapter implements IUIFlowAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(): Promise<void> {
    const config = getConfig();
    this.browser = await chromium.launch({
      headless: config.browser.headless,
    });

    const { execution } = config;
    const timeout = execution.actionTimeoutMs;

    this.context = await this.browser.newContext({
      viewport: { width: execution.viewport.width, height: execution.viewport.height },
      locale: config.browser.locale,
      recordVideo: {
        dir: execution.videoDir,
        size: { width: execution.viewport.width, height: execution.viewport.height },
      },
      // No retries: we do not use test runner retries; failures propagate.
    });
    this.context.setDefaultTimeout(timeout);

    this.page = await this.context.newPage();
    await this.page.addInitScript((css: string) => {
      const style = document.createElement("style");
      style.textContent = css;
      document.documentElement.appendChild(style);
    }, ANIMATION_DISABLE_CSS);
  }

  async executeStep(step: FlowStep): Promise<void> {
    const page = this.page;
    if (!page) throw new Error("Adapter not launched");

    const config = getConfig();
    const timeout = config.execution.actionTimeoutMs;
    const stepTimeout = step.timeout_ms ?? timeout;

    switch (step.action) {
      case "navigate": {
        if (step.url === undefined) throw new Error("navigate requires url");
        await page.goto(step.url, { timeout: stepTimeout, waitUntil: "load" });
        return;
      }
      case "click": {
        if (step.selector === undefined) throw new Error("click requires selector");
        await page.click(step.selector, { timeout: stepTimeout });
        return;
      }
      case "fill": {
        if (step.selector === undefined) throw new Error("fill requires selector");
        await page.fill(step.selector, step.value ?? "", { timeout: stepTimeout });
        return;
      }
      case "wait": {
        const ms = step.timeout_ms ?? 0;
        await page.waitForTimeout(ms);
        return;
      }
      case "screenshot": {
        // Optional: save to a path if we add it to step later; for now no-op or throw if required
        await page.waitForTimeout(0);
        return;
      }
      case "done":
        return;
      default:
        throw new Error(`Unknown action: ${(step as FlowStep).action}`);
    }
  }

  /**
   * Video file is flushed only after context.close().
   * Media composition must not run before this completes.
   */
  async close(runId: string): Promise<string | undefined> {
    const page = this.page;
    const context = this.context;
    const browser = this.browser;

    if (!page || !context || !browser) return undefined;

    const video = page.video();
    if (!video) {
      await page.close();
      await context.close();
      await browser.close();
      this.page = null;
      this.context = null;
      this.browser = null;
      return undefined;
    }

    await page.close();
    await context.close();
    let tempPath: string | null = null;
    try {
      tempPath = await video.path();
    } catch {
      // e.g. "Page did not produce any video frames" when no frames were recorded
    }
    await browser.close();

    this.page = null;
    this.context = null;
    this.browser = null;

    if (!tempPath || tempPath === "") return undefined;

    const config = getConfig();
    const outDir = join(process.cwd(), config.execution.artifactsDir, runId);
    const finalPath = join(outDir, "raw.webm");
    await mkdir(outDir, { recursive: true });
    await copyFile(tempPath, finalPath);
    await unlink(tempPath).catch(() => {});

    return finalPath;
  }
}
