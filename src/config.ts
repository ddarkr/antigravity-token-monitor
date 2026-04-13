import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export const EXTENSION_ID = 'antigravity-token-monitor';

export type MonitorConfig = {
  sessionRoot: string;
  debug: boolean;
  pollIntervalMs: number;
  historyLimit: number;
  maxFileBytes: number;
  useRpcExport: boolean;
  exportStepsJsonl: boolean;
  rpcExportIntervalMs: number;
  rpcTimeoutMs: number;
};

export function getDefaultSessionRoot(): string {
  return path.join(os.homedir(), '.gemini', 'antigravity');
}

export function readConfig(): MonitorConfig {
  const config = vscode.workspace.getConfiguration(EXTENSION_ID);
  const sessionRoot = config.get<string>('sessionRoot')?.trim() || getDefaultSessionRoot();

  return {
    sessionRoot,
    debug: config.get<boolean>('debug', false),
    pollIntervalMs: validateTimeConfig('pollIntervalMs', config.get<number>('pollIntervalMs', 60000), 60000),
    historyLimit: config.get<number>('historyLimit', 120),
    maxFileBytes: config.get<number>('maxFileBytes', 10 * 1024 * 1024),  // 10MB default to handle large usage.jsonl files
    useRpcExport: config.get<boolean>('useRpcExport', true),
    exportStepsJsonl: config.get<boolean>('exportStepsJsonl', false),
    rpcExportIntervalMs: validateTimeConfig('rpcExportIntervalMs', config.get<number>('rpcExportIntervalMs', 300000), 300000),
    rpcTimeoutMs: validateTimeConfig('rpcTimeoutMs', config.get<number>('rpcTimeoutMs', 5000), 5000)
  };
}

/**
 * Validates time-based configuration values (intervals and timeouts).
 * Clamps values to a safe range and warns on out-of-bounds input.
 */
function validateTimeConfig(name: string, value: number, defaultValue: number): number {
  const MIN_MS = 1000;
  const MAX_MS = 600_000;
  const num = Number(value);
  if (!Number.isFinite(num) || num < MIN_MS) {
    console.warn(`[Config] ${name}=${value} is invalid or too low (<${MIN_MS}ms), using ${MIN_MS}ms.`);
    return MIN_MS;
  }
  if (num > MAX_MS) {
    console.warn(`[Config] ${name}=${value} is too high (>-${MAX_MS}ms), using ${MAX_MS}ms.`);
    return MAX_MS;
  }
  return num;
}
