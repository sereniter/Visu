import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

export interface LogEntry {
  runId: string;
  timestamp: string;
  step: string;
  level?: "info" | "warn" | "error" | "debug";
  message?: string;
  payload?: object;
}

export function createRunId(): string {
  return randomUUID();
}

export function timestampIso(): string {
  return new Date().toISOString();
}

export function createLogger(runId: string, logPath: string): {
  log: (step: string, options?: { level?: LogEntry["level"]; message?: string; payload?: object }) => void;
  close: () => void;
} {
  function log(
    step: string,
    options?: { level?: LogEntry["level"]; message?: string; payload?: object }
  ): void {
    const entry: LogEntry = {
      runId,
      timestamp: timestampIso(),
      step,
      ...(options?.level && { level: options.level }),
      ...(options?.message !== undefined && { message: options.message }),
      ...(options?.payload !== undefined && { payload: options.payload }),
    };
    appendFileSync(logPath, JSON.stringify(entry) + "\n");
  }

  function close(): void {
    // No-op for sync writes; kept for API compatibility
  }

  return { log, close };
}
