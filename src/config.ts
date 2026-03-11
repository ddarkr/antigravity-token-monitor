import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export const EXTENSION_ID = 'antigravity-token-monitor';

export type MonitorConfig = {
  sessionRoot: string;
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
    pollIntervalMs: config.get<number>('pollIntervalMs', 60000),
    historyLimit: config.get<number>('historyLimit', 120),
    maxFileBytes: config.get<number>('maxFileBytes', 524288),
    useRpcExport: config.get<boolean>('useRpcExport', true),
    exportStepsJsonl: config.get<boolean>('exportStepsJsonl', false),
    rpcExportIntervalMs: config.get<number>('rpcExportIntervalMs', 300000),
    rpcTimeoutMs: config.get<number>('rpcTimeoutMs', 5000)
  };
}
