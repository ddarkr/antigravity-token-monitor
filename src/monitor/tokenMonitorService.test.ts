import { mkdtemp } from 'fs/promises';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type * as vscode from 'vscode';
import { afterEach, describe, expect, it } from 'vitest';
import type { MonitorConfig } from '../config';
import { AntigravitySessionParser } from '../parser/antigravitySessionParser';
import { SnapshotStore } from '../storage/snapshotStore';
import type { PersistedSessionState, SessionParsePlan, SessionScanCandidate, SessionScanResult, SessionTotals } from '../types';
import { TokenMonitorService } from './tokenMonitorService';
import { SessionScanner } from './sessionScanner';
import { SessionUsageCalculator } from './sessionUsageCalculator';

describe('TokenMonitorService', () => {
  const services: TokenMonitorService[] = [];

  afterEach(() => {
    while (services.length > 0) {
      services.pop()?.dispose();
    }
  });

  it('archives persisted sessions when they disappear from the brain scan', async () => {
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-monitor-'));
    const harness = await createStoreHarness();
    await harness.store.save({
      sessions: {
        'session-1': buildPersistedSession('session-1', 100, 'active')
      }
    });

    const service = createService({
      sessionRoot,
      store: harness.store,
      scannerResults: [{ sessions: [], complete: true }],
      parseResults: []
    });
    services.push(service);

    await service.initialize();

    const state = service.getDashboardState();
    expect(state.syncStatus).toBe('idle');
    expect(state.summary.sessionCount).toBe(1);
    expect(state.summary.activeSessionCount).toBe(0);
    expect(state.summary.archivedSessionCount).toBe(1);
    expect(state.summary.changedSessionCount).toBe(0);
    expect(state.sessions[0]?.status).toBe('archived');
    expect(state.sessions[0]?.latest.totalTokens).toBe(100);
    expect(state.sessions[0]?.latestDelta.totalTokens).toBe(0);

    const persisted = await harness.store.load();
    expect(persisted.sessions['session-1']?.lifecycle.status).toBe('archived');
    expect(persisted.sessions['session-1']?.lifecycle.archivedAt).toBeGreaterThan(0);
    expect(Object.keys((await readStoreFile(harness.storagePath, 'monitor-state.json')).sessions)).toEqual([]);
    expect(Object.keys((await readStoreFile(harness.storagePath, archiveFileNameFor(persisted.sessions['session-1']!))).sessions)).toEqual(['session-1']);
  });

  it('reactivates archived sessions when they reappear in a later scan', async () => {
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-monitor-'));
    const harness = await createStoreHarness();
    await harness.store.save({
      sessions: {
        'session-1': buildPersistedSession('session-1', 100, 'active')
      }
    });

    const service = createService({
      sessionRoot,
      store: harness.store,
      scannerResults: [
        { sessions: [], complete: true },
        { sessions: [buildCandidate(sessionRoot)], complete: true }
      ],
      parseResults: [buildTotals('session-1', 125)]
    });
    services.push(service);

    await service.initialize();
    await service.refresh({ force: true, skipExport: true });

    const state = service.getDashboardState();
    expect(state.summary.activeSessionCount).toBe(1);
    expect(state.summary.archivedSessionCount).toBe(0);
    expect(state.summary.changedSessionCount).toBe(1);
    expect(state.sessions[0]?.status).toBe('active');
    expect(state.sessions[0]?.latest.totalTokens).toBe(125);
    expect(state.sessions[0]?.latestDelta.totalTokens).toBe(25);
    expect(state.sessions[0]?.archivedAt).toBeUndefined();
    expect(Object.keys((await readStoreFile(harness.storagePath, 'monitor-state.json')).sessions)).toEqual(['session-1']);
    expect((await listArchiveFiles(harness.storagePath)).length).toBe(0);
  });

  it('does not resurrect stale positive delta when an archived session reappears unchanged', async () => {
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-monitor-'));
    const harness = await createStoreHarness();
    await harness.store.save({
      sessions: {
        'session-1': buildPersistedSession('session-1', 100, 'active')
      }
    });

    const service = createService({
      sessionRoot,
      store: harness.store,
      scannerResults: [
        { sessions: [], complete: true },
        { sessions: [buildCandidate(sessionRoot)], complete: true }
      ],
      parseResults: [buildTotals('session-1', 100)]
    });
    services.push(service);

    await service.initialize();
    await service.refresh({ force: true, skipExport: true });

    const state = service.getDashboardState();
    expect(state.summary.activeSessionCount).toBe(1);
    expect(state.summary.changedSessionCount).toBe(0);
    expect(state.sessions[0]?.status).toBe('active');
    expect(state.sessions[0]?.latestDelta.totalTokens).toBe(0);
    expect(state.analytics.rpcCoverage.changedSessions).toBe(0);
  });

  it('treats a missing brain directory as an empty scan and archives persisted sessions', async () => {
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-monitor-'));
    const harness = await createStoreHarness();
    await harness.store.save({
      sessions: {
        'session-1': buildPersistedSession('session-1', 100, 'active')
      }
    });

    const service = createService({
      sessionRoot,
      store: harness.store,
      scannerResults: [
        {
          sessions: [],
          complete: false,
          error: `ENOENT: no such file or directory, scandir '${path.join(sessionRoot, 'brain')}'`
        }
      ],
      parseResults: []
    });
    services.push(service);

    await service.initialize();

    const state = service.getDashboardState();
    expect(state.syncStatus).toBe('idle');
    expect(state.syncMessage).toBe('');
    expect(state.summary.activeSessionCount).toBe(0);
    expect(state.summary.archivedSessionCount).toBe(1);
    expect(state.sessions[0]?.status).toBe('archived');
  });

  it('keeps scan errors when ENOENT does not come from the brain root', async () => {
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-monitor-'));
    const harness = await createStoreHarness();
    await harness.store.save({
      sessions: {
        'session-1': buildPersistedSession('session-1', 100, 'active')
      }
    });

    const service = createService({
      sessionRoot,
      store: harness.store,
      scannerResults: [
        {
          sessions: [],
          complete: false,
          error: `ENOENT: no such file or directory, stat '${path.join(sessionRoot, 'brain', 'session-1', 'usage.jsonl')}'`
        }
      ],
      parseResults: []
    });
    services.push(service);

    await service.initialize();

    const state = service.getDashboardState();
    expect(state.syncStatus).toBe('error');
    expect(state.syncMessage).toContain('ENOENT');
    expect(state.summary.activeSessionCount).toBe(1);
    expect(state.summary.archivedSessionCount).toBe(0);
    expect(state.sessions[0]?.status).toBe('active');
  });
});

function createService(options: {
  sessionRoot: string;
  store: SnapshotStore;
  scannerResults: SessionScanResult[];
  parseResults: SessionTotals[];
}): TokenMonitorService {
  const scanner = new StubSessionScanner(options.scannerResults);
  const parser = new StubParser(options.parseResults);
  return new TokenMonitorService(
    () => buildConfig(options.sessionRoot),
    scanner,
    () => parser,
    new SessionUsageCalculator(),
    options.store,
    createOutputChannel()
  );
}

function buildConfig(sessionRoot: string): MonitorConfig {
  return {
    sessionRoot,
    debug: false,
    pollIntervalMs: 60_000,
    historyLimit: 120,
    maxFileBytes: 1024,
    useRpcExport: false,
    exportStepsJsonl: false,
    rpcExportIntervalMs: 300_000,
    rpcTimeoutMs: 5_000
  };
}

async function createStoreHarness(): Promise<{ store: SnapshotStore; storagePath: string }> {
  const storagePath = await mkdtemp(path.join(tmpdir(), 'antigravity-state-'));
  return {
    store: new SnapshotStore(createExtensionContext(storagePath)),
    storagePath
  };
}

async function readStoreFile(filePathRoot: string, fileName: string): Promise<{ lastPollAt?: number; sessions: Record<string, PersistedSessionState> }> {
  return JSON.parse(await fs.readFile(path.join(filePathRoot, fileName), 'utf8')) as {
    lastPollAt?: number;
    sessions: Record<string, PersistedSessionState>;
  };
}

function archiveFileNameFor(session: PersistedSessionState): string {
  const archivedAt = session.lifecycle.archivedAt ?? session.lifecycle.lastSeenAt;
  const date = new Date(archivedAt);
  return `monitor-state.archive-${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}.json`;
}

async function listArchiveFiles(storagePath: string): Promise<string[]> {
  return (await fs.readdir(storagePath)).filter((entry) => entry.startsWith('monitor-state.archive-'));
}

function buildPersistedSession(
  sessionId: string,
  totalTokens: number,
  status: 'active' | 'archived'
): PersistedSessionState {
  const latest = buildTotals(sessionId, totalTokens);
  return {
    signature: `signature-${sessionId}`,
    latest,
    snapshots: [
      {
        capturedAt: latest.lastModifiedMs,
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
      lastSeenAt: latest.lastModifiedMs,
      archivedAt: status === 'archived' ? latest.lastModifiedMs : undefined
    }
  };
}

function buildTotals(sessionId: string, totalTokens: number): SessionTotals {
  return {
    sessionId,
    label: `Session ${sessionId}`,
    filePath: `/mock/${sessionId}`,
    lastModifiedMs: 1_700_000_000_000 + totalTokens,
    mode: 'reported',
    source: 'filesystem',
    evidenceCount: 1,
    messageCount: 4,
    inputTokens: Math.floor(totalTokens * 0.5),
    outputTokens: Math.floor(totalTokens * 0.25),
    cacheReadTokens: Math.floor(totalTokens * 0.15),
    cacheWriteTokens: Math.floor(totalTokens * 0.05),
    reasoningTokens: totalTokens - Math.floor(totalTokens * 0.5) - Math.floor(totalTokens * 0.25) - Math.floor(totalTokens * 0.15) - Math.floor(totalTokens * 0.05),
    totalTokens,
    modelBreakdowns: {
      'gemini-2.5-pro': {
        inputTokens: Math.floor(totalTokens * 0.5),
        outputTokens: Math.floor(totalTokens * 0.25),
        cacheReadTokens: Math.floor(totalTokens * 0.15),
        cacheWriteTokens: Math.floor(totalTokens * 0.05),
        reasoningTokens: totalTokens - Math.floor(totalTokens * 0.5) - Math.floor(totalTokens * 0.25) - Math.floor(totalTokens * 0.15) - Math.floor(totalTokens * 0.05),
        totalTokens
      }
    }
  };
}

function buildCandidate(sessionRoot: string): SessionScanCandidate {
  return {
    sessionId: 'session-1',
    sessionDir: path.join(sessionRoot, 'brain', 'session-1'),
    filePaths: [],
    labelHint: 'Session session-1',
    lastModifiedMs: 1_700_000_000_125,
    signature: 'signature-session-1'
  };
}

class StubSessionScanner extends SessionScanner {
  constructor(private readonly results: SessionScanResult[]) {
    super();
  }

  override async scan(): Promise<SessionScanResult> {
    return this.results.shift() ?? { sessions: [], complete: true };
  }
}

class StubParser extends AntigravitySessionParser {
  constructor(private readonly results: SessionTotals[]) {
    super(0);
  }

  override async parse(_candidate: SessionParsePlan): Promise<SessionTotals> {
    const next = this.results.shift();
    if (!next) {
      throw new Error('No parser result queued for test.');
    }

    return next;
  }
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

function createOutputChannel(): vscode.OutputChannel {
  return {
    name: 'test-output',
    append() {},
    appendLine() {},
    replace() {},
    clear() {},
    show() {},
    hide() {},
    dispose() {}
  };
}
