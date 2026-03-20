import * as fs from 'fs/promises';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type * as vscode from 'vscode';
import { describe, expect, it } from 'vitest';
import type { PersistedSessionState, SessionTotals } from '../types';
import { SnapshotStore } from './snapshotStore';

describe('SnapshotStore', () => {
  it('writes only active sessions to monitor-state.json and shards archived sessions by month', async () => {
    const storagePath = await mkdtemp(path.join(tmpdir(), 'antigravity-snapshot-store-'));
    const store = new SnapshotStore(createExtensionContext(storagePath));

    await store.save({
      lastPollAt: 1_710_000_000_000,
      sessions: {
        active: buildPersistedSession('active', 100, 'active', Date.UTC(2026, 2, 20)),
        archivedMarch: buildPersistedSession('archivedMarch', 200, 'archived', Date.UTC(2026, 2, 15)),
        archivedApril: buildPersistedSession('archivedApril', 300, 'archived', Date.UTC(2026, 3, 2))
      }
    });

    const activeState = await readJson(path.join(storagePath, 'monitor-state.json'));
    expect(Object.keys(activeState.sessions)).toEqual(['active']);
    expect(activeState.lastPollAt).toBe(1_710_000_000_000);

    const marchShard = await readJson(path.join(storagePath, 'monitor-state.archive-2026-03.json'));
    expect(Object.keys(marchShard.sessions)).toEqual(['archivedMarch']);
    expect(marchShard.lastPollAt).toBeUndefined();

    const aprilShard = await readJson(path.join(storagePath, 'monitor-state.archive-2026-04.json'));
    expect(Object.keys(aprilShard.sessions)).toEqual(['archivedApril']);
    expect(aprilShard.lastPollAt).toBeUndefined();
  });

  it('loads and merges active state with all archive shards', async () => {
    const storagePath = await mkdtemp(path.join(tmpdir(), 'antigravity-snapshot-store-'));
    await fs.writeFile(path.join(storagePath, 'monitor-state.json'), JSON.stringify({
      lastPollAt: 1_710_000_000_000,
      sessions: {
        active: buildPersistedSession('active', 100, 'active', Date.UTC(2026, 2, 20))
      }
    }, null, 2), 'utf8');
    await fs.writeFile(path.join(storagePath, 'monitor-state.archive-2026-03.json'), JSON.stringify({
      sessions: {
        archivedMarch: buildPersistedSession('archivedMarch', 200, 'archived', Date.UTC(2026, 2, 15))
      }
    }, null, 2), 'utf8');
    await fs.writeFile(path.join(storagePath, 'monitor-state.archive-2026-04.json'), JSON.stringify({
      sessions: {
        archivedApril: buildPersistedSession('archivedApril', 300, 'archived', Date.UTC(2026, 3, 2))
      }
    }, null, 2), 'utf8');

    const store = new SnapshotStore(createExtensionContext(storagePath));
    const loaded = await store.load();

    expect(loaded.lastPollAt).toBe(1_710_000_000_000);
    expect(Object.keys(loaded.sessions).sort()).toEqual(['active', 'archivedApril', 'archivedMarch']);
    expect(loaded.sessions.archivedMarch?.lifecycle.status).toBe('archived');
  });

  it('prefers active state when a session exists in both active and archive files', async () => {
    const storagePath = await mkdtemp(path.join(tmpdir(), 'antigravity-snapshot-store-'));
    await fs.writeFile(path.join(storagePath, 'monitor-state.json'), JSON.stringify({
      sessions: {
        duplicated: buildPersistedSession('duplicated', 500, 'active', Date.UTC(2026, 2, 20))
      }
    }, null, 2), 'utf8');
    await fs.writeFile(path.join(storagePath, 'monitor-state.archive-2026-03.json'), JSON.stringify({
      sessions: {
        duplicated: buildPersistedSession('duplicated', 100, 'archived', Date.UTC(2026, 2, 1))
      }
    }, null, 2), 'utf8');

    const store = new SnapshotStore(createExtensionContext(storagePath));
    const loaded = await store.load();

    expect(loaded.sessions.duplicated?.lifecycle.status).toBe('active');
    expect(loaded.sessions.duplicated?.latest.totalTokens).toBe(500);
  });

  it('removes obsolete archive shards when archived sessions reactivate into active state', async () => {
    const storagePath = await mkdtemp(path.join(tmpdir(), 'antigravity-snapshot-store-'));
    const store = new SnapshotStore(createExtensionContext(storagePath));

    await store.save({
      sessions: {
        archived: buildPersistedSession('archived', 150, 'archived', Date.UTC(2026, 2, 15))
      }
    });

    await store.save({
      sessions: {
        archived: buildPersistedSession('archived', 175, 'active', Date.UTC(2026, 2, 20))
      }
    });

    const activeState = await readJson(path.join(storagePath, 'monitor-state.json'));
    expect(Object.keys(activeState.sessions)).toEqual(['archived']);
    await expect(fs.stat(path.join(storagePath, 'monitor-state.archive-2026-03.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rewrites legacy monolithic state into split active and archived files on save', async () => {
    const storagePath = await mkdtemp(path.join(tmpdir(), 'antigravity-snapshot-store-'));
    await fs.writeFile(path.join(storagePath, 'monitor-state.json'), JSON.stringify({
      lastPollAt: 1_710_000_000_000,
      sessions: {
        active: buildPersistedSession('active', 100, 'active', Date.UTC(2026, 2, 20)),
        archived: buildPersistedSession('archived', 200, 'archived', Date.UTC(2026, 1, 1))
      }
    }, null, 2), 'utf8');

    const store = new SnapshotStore(createExtensionContext(storagePath));
    const loaded = await store.load();
    await store.save(loaded);

    const activeState = await readJson(path.join(storagePath, 'monitor-state.json'));
    expect(Object.keys(activeState.sessions)).toEqual(['active']);

    const archiveState = await readJson(path.join(storagePath, 'monitor-state.archive-2026-02.json'));
    expect(Object.keys(archiveState.sessions)).toEqual(['archived']);
  });
});

async function readJson(filePath: string): Promise<{ lastPollAt?: number; sessions: Record<string, PersistedSessionState> }> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as { lastPollAt?: number; sessions: Record<string, PersistedSessionState> };
}

function buildPersistedSession(
  sessionId: string,
  totalTokens: number,
  status: 'active' | 'archived',
  capturedAt: number
): PersistedSessionState {
  const latest = buildTotals(sessionId, totalTokens, capturedAt);
  return {
    signature: `signature-${sessionId}`,
    latest,
    snapshots: [
      {
        capturedAt,
        mode: latest.mode,
        inputTokens: latest.inputTokens,
        outputTokens: latest.outputTokens,
        cacheReadTokens: latest.cacheReadTokens,
        cacheWriteTokens: latest.cacheWriteTokens,
        reasoningTokens: latest.reasoningTokens,
        totalTokens: latest.totalTokens
      }
    ],
    lifecycle: {
      status,
      lastSeenAt: capturedAt,
      archivedAt: status === 'archived' ? capturedAt : undefined
    }
  };
}

function buildTotals(sessionId: string, totalTokens: number, capturedAt: number): SessionTotals {
  return {
    sessionId,
    label: `Session ${sessionId}`,
    filePath: `/mock/${sessionId}`,
    lastModifiedMs: capturedAt,
    mode: 'reported',
    source: 'filesystem',
    evidenceCount: 1,
    messageCount: 4,
    inputTokens: Math.floor(totalTokens * 0.5),
    outputTokens: Math.floor(totalTokens * 0.25),
    cacheReadTokens: Math.floor(totalTokens * 0.15),
    cacheWriteTokens: Math.floor(totalTokens * 0.05),
    reasoningTokens: totalTokens - Math.floor(totalTokens * 0.5) - Math.floor(totalTokens * 0.25) - Math.floor(totalTokens * 0.15) - Math.floor(totalTokens * 0.05),
    totalTokens
  };
}

function createExtensionContext(globalStoragePath: string): vscode.ExtensionContext {
  const uri = createUri(globalStoragePath);
  const noopDisposable = { dispose() {} };
  const noopEvent = <T,>(): vscode.Event<T> => (_listener) => noopDisposable;
  const memento = createMemento();
  const environmentVariableCollection = createEnvironmentVariableCollection();

  return {
    subscriptions: [],
    workspaceState: memento,
    globalState: {
      ...memento,
      setKeysForSync() {}
    },
    secrets: {
      keys: async () => [],
      get: async () => undefined,
      store: async () => {},
      delete: async () => {},
      onDidChange: noopEvent()
    },
    extensionUri: uri,
    extensionPath: globalStoragePath,
    environmentVariableCollection,
    asAbsolutePath: (relativePath: string) => path.join(globalStoragePath, relativePath),
    storageUri: uri,
    storagePath: globalStoragePath,
    globalStorageUri: uri,
    globalStoragePath,
    logUri: uri,
    logPath: globalStoragePath,
    extensionMode: 3,
    extension: {
      id: 'test.antigravity-token-monitor',
      extensionUri: uri,
      extensionPath: globalStoragePath,
      isActive: true,
      packageJSON: {},
      extensionKind: 2,
      exports: undefined,
      activate: async () => undefined
    },
    languageModelAccessInformation: {
      onDidChange: noopEvent(),
      canSendRequest: () => false
    }
  };
}

function createUri(fsPath: string): vscode.Uri {
  return {
    scheme: 'file',
    authority: '',
    path: fsPath,
    query: '',
    fragment: '',
    fsPath,
    with(change) {
      return createUri(change.path ?? fsPath);
    },
    toString() {
      return fsPath;
    },
    toJSON() {
      return {
        scheme: 'file',
        authority: '',
        path: fsPath,
        query: '',
        fragment: ''
      };
    }
  } as vscode.Uri;
}

function createMemento(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => Array.from(values.keys()),
    get: <T>(key: string, defaultValue?: T) => (values.has(key) ? values.get(key) as T : defaultValue as T),
    update: async (key: string, value: unknown) => {
      if (value === undefined) {
        values.delete(key);
        return;
      }

      values.set(key, value);
    }
  };
}

function createEnvironmentVariableCollection(): vscode.GlobalEnvironmentVariableCollection {
  const entries = new Map<string, vscode.EnvironmentVariableMutator>();
  const collection: vscode.GlobalEnvironmentVariableCollection = {
    persistent: true,
    description: undefined,
    replace(variable: string, value: string) {
      entries.set(variable, { type: 1, value, options: { applyAtProcessCreation: true } });
    },
    append(variable: string, value: string) {
      entries.set(variable, { type: 2, value, options: { applyAtProcessCreation: true } });
    },
    prepend(variable: string, value: string) {
      entries.set(variable, { type: 3, value, options: { applyAtProcessCreation: true } });
    },
    get(variable: string) {
      return entries.get(variable);
    },
    forEach(callback) {
      for (const [variable, mutator] of entries) {
        callback(variable, mutator, collection);
      }
    },
    delete(variable: string) {
      entries.delete(variable);
    },
    clear() {
      entries.clear();
    },
    getScoped() {
      return collection;
    },
    [Symbol.iterator]() {
      return entries[Symbol.iterator]();
    }
  };

  return collection;
}
