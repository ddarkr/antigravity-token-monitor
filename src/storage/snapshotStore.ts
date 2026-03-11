import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { PersistedState } from '../types';

const STATE_FILE_NAME = 'monitor-state.json';

export class SnapshotStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async load(): Promise<PersistedState> {
    const filePath = this.getStateFilePath();
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as PersistedState;
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;
      if (fileError.code === 'ENOENT') {
        return { sessions: {} };
      }

      console.warn('[antigravity-token-monitor] Failed to load state:', error);
      return { sessions: {} };
    }
  }

  async save(state: PersistedState): Promise<void> {
    const filePath = this.getStateFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  private getStateFilePath(): string {
    return path.join(this.context.globalStorageUri.fsPath, STATE_FILE_NAME);
  }
}
