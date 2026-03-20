import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { PersistedSessionState, PersistedState } from '../types';

const STATE_FILE_NAME = 'monitor-state.json';
const ARCHIVE_FILE_PREFIX = 'monitor-state.archive-';
const ARCHIVE_FILE_SUFFIX = '.json';

export class SnapshotStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async load(): Promise<PersistedState> {
    const storageDir = this.getStorageDirectoryPath();
    try {
      await fs.mkdir(storageDir, { recursive: true });
      const activeState = await this.loadJsonFile(this.getStateFilePath());
      const archiveStates = await this.loadArchiveStates(storageDir);

      return {
        lastPollAt: activeState?.lastPollAt,
        sessions: mergeSessionMaps([
          ...archiveStates.map((state) => state.sessions),
          activeState?.sessions ?? {}
        ])
      };
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
    const storageDir = this.getStorageDirectoryPath();
    await fs.mkdir(storageDir, { recursive: true });

    const activeSessions: PersistedState['sessions'] = {};
    const archivedByMonth = new Map<string, PersistedState['sessions']>();

    for (const [sessionId, session] of Object.entries(state.sessions)) {
      if (session.lifecycle.status === 'archived') {
        const archiveMonth = resolveArchiveMonth(session);
        const bucket = archivedByMonth.get(archiveMonth) ?? {};
        bucket[sessionId] = session;
        archivedByMonth.set(archiveMonth, bucket);
        continue;
      }

      activeSessions[sessionId] = session;
    }

    await fs.writeFile(
      this.getStateFilePath(),
      JSON.stringify({ lastPollAt: state.lastPollAt, sessions: activeSessions }, null, 2),
      'utf8'
    );

    const expectedArchiveFiles = new Set<string>();
    for (const [archiveMonth, sessions] of archivedByMonth) {
      const filePath = this.getArchiveFilePath(archiveMonth);
      expectedArchiveFiles.add(filePath);
      await fs.writeFile(filePath, JSON.stringify({ sessions }, null, 2), 'utf8');
    }

    const existingArchiveFiles = await this.listArchiveFilePaths(storageDir);
    await Promise.all(existingArchiveFiles
      .filter((filePath) => !expectedArchiveFiles.has(filePath))
      .map(async (filePath) => {
        await fs.unlink(filePath);
      }));
  }

  private async loadArchiveStates(storageDir: string): Promise<PersistedState[]> {
    const filePaths = await this.listArchiveFilePaths(storageDir);
    const states = await Promise.all(filePaths.map((filePath) => this.loadJsonFile(filePath)));
    return states.filter((state): state is PersistedState => state !== undefined);
  }

  private async loadJsonFile(filePath: string): Promise<PersistedState | undefined> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as PersistedState;
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;
      if (fileError.code === 'ENOENT') {
        return undefined;
      }

      throw error;
    }
  }

  private async listArchiveFilePaths(storageDir: string): Promise<string[]> {
    const entries = await fs.readdir(storageDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(ARCHIVE_FILE_PREFIX) && entry.name.endsWith(ARCHIVE_FILE_SUFFIX))
      .map((entry) => path.join(storageDir, entry.name))
      .sort();
  }

  private getArchiveFilePath(archiveMonth: string): string {
    return path.join(this.getStorageDirectoryPath(), `${ARCHIVE_FILE_PREFIX}${archiveMonth}${ARCHIVE_FILE_SUFFIX}`);
  }

  private getStorageDirectoryPath(): string {
    return this.context.globalStorageUri.fsPath;
  }

  private getStateFilePath(): string {
    return path.join(this.context.globalStorageUri.fsPath, STATE_FILE_NAME);
  }
}

function mergeSessionMaps(sessionMaps: Array<Record<string, PersistedSessionState>>): Record<string, PersistedSessionState> {
  return Object.assign({}, ...sessionMaps);
}

function resolveArchiveMonth(session: PersistedSessionState): string {
  const archivedAt = session.lifecycle.archivedAt ?? session.lifecycle.lastSeenAt;
  const date = new Date(archivedAt);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
