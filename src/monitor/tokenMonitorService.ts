import * as path from 'path';
import * as vscode from 'vscode';
import { MonitorConfig } from '../config';
import { resolveParsePlan } from './sourceResolver';
import { AntigravitySessionParser } from '../parser/antigravitySessionParser';
import { TrajectoryExporter } from '../rpc/trajectoryExporter';
import { RpcArtifactStore } from '../storage/rpcArtifactStore';
import { SnapshotStore } from '../storage/snapshotStore';
import {
  ActivityHeatmapBin,
  DashboardAnalytics,
  DashboardState,
  PersistedState,
  PersistedSessionState,
  SessionLifecycle,
  SessionSnapshot,
  SessionTotals,
  SourceBreakdown,
  ModeBreakdown,
  TokenMode,
  TokenSource,
  ModelUsageBreakdown,
  RpcCoverageBreakdown
} from '../types';
import { SessionScanner } from './sessionScanner';
import { SessionUsageCalculator } from './sessionUsageCalculator';
import {
  calculateModelCost,
  LiteLlmPricingCatalog,
  type LiteLlmPricingSnapshot
} from '../pricing/litellmPricing';
import { PollLock } from './pollLock';

type Listener = (state: DashboardState) => void;

type BucketAccumulator = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
  messageCount: number;
  sessionIds: Set<string>;
};

type ModelAccumulator = {
  totalTokens: number;
  sessionIds: Set<string>;
  breakdownAvailable: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
};

type PricingState = {
  snapshot?: LiteLlmPricingSnapshot;
  error?: string;
};

export class TokenMonitorService implements vscode.Disposable {
  private readonly listeners = new Set<Listener>();
  private timer: NodeJS.Timeout | null = null;
  private exportTimer: NodeJS.Timeout | null = null;
  private emitTimer: NodeJS.Timeout | null = null;
  private manualRefreshTimer: NodeJS.Timeout | null = null;
  private pendingEmit = false;
  private state: PersistedState = { sessions: {} };
  private running = false;
  private exportRunning = false;
  private lastError: string | undefined;
  private lastExportError: string | undefined;
  private lastExportAt: number | undefined;
  private lastExportedCount = 0;
  private readonly pricingCatalog = new LiteLlmPricingCatalog();
  private pricingState: PricingState = {};

  private static readonly EMIT_DEBOUNCE_MS = 150;
  private static readonly MANUAL_REFRESH_DELAY_MS = TokenMonitorService.EMIT_DEBOUNCE_MS;

  constructor(
    private readonly configProvider: () => MonitorConfig,
    private readonly scanner: SessionScanner,
    private readonly parserFactory: (config: MonitorConfig) => AntigravitySessionParser,
    private readonly calculator: SessionUsageCalculator,
    private readonly store: SnapshotStore,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async initialize(): Promise<void> {
    this.state = normalizePersistedState(await this.store.load());
    await this.refresh();
    this.startTimer();
    this.startExportTimer();
  }

  onDidChange(listener: Listener): vscode.Disposable {
    this.listeners.add(listener);
    listener(this.getDashboardState());
    return new vscode.Disposable(() => {
      this.listeners.delete(listener);
    });
  }

  getDashboardState(): DashboardState {
    const sessions = Object.values(this.state.sessions)
      .map((session) => toDashboardSession(session))
      .sort(compareDashboardSessions);
    const activeSessions = sessions.filter((session) => session.status === 'active');
    const archivedSessions = sessions.filter((session) => session.status === 'archived');
    const analyticsBundle = buildDashboardAnalytics(
      this.state.sessions,
      this.lastExportedCount,
      this.pricingState.snapshot,
      this.pricingState.error,
      (model) => this.pricingCatalog.resolveModelPricing(model)
    );

    return {
      rootPath: this.configProvider().sessionRoot,
      config: {
        useRpcExport: this.configProvider().useRpcExport,
        exportStepsJsonl: this.configProvider().exportStepsJsonl,
        pollIntervalMs: this.configProvider().pollIntervalMs
      },
      lastPollAt: this.state.lastPollAt,
      syncStatus: this.running ? 'running' : this.lastError ? 'error' : 'idle',
      syncMessage: this.running
        ? 'Refreshing token data...'
        : this.lastError ?? '',
      exportStatus: {
        status: this.exportRunning ? 'running' : this.lastExportError ? 'error' : 'idle',
        message: this.exportRunning
          ? 'Exporting Antigravity sessions...'
          : this.lastExportError ?? 'Background JSONL export is idle.',
        lastExportAt: this.lastExportAt,
        lastExportedCount: this.lastExportedCount
      },
      sessions,
      summary: {
        sessionCount: sessions.length,
        activeSessionCount: activeSessions.length,
        archivedSessionCount: archivedSessions.length,
        messageCount: sessions.reduce((sum, session) => sum + session.messageCount, 0),
        changedSessionCount: activeSessions.filter((session) => session.latestDelta.totalTokens > 0).length,
        totalTokens: sessions.reduce((sum, session) => sum + session.latest.totalTokens, 0),
        estimatedSessionCount: sessions.filter((session) => session.mode === 'estimated').length
      },
      pricing: analyticsBundle.pricing,
      analytics: analyticsBundle.analytics
    };
  }

  async refresh(options?: { skipExport?: boolean; force?: boolean; selectiveForce?: boolean }): Promise<void> {
    if (this.running) {
      this.log('Refresh skipped: service is already running.');
      return;
    }

    const config = this.configProvider();
    this.log(
      `Refresh requested: force=${options?.force === true} selectiveForce=${options?.selectiveForce === true} skipExport=${options?.skipExport === true}.`
    );

    if (!options?.force) {
      const freshState = normalizePersistedState(await this.store.load());
      if (freshState.lastPollAt && Date.now() - freshState.lastPollAt < config.pollIntervalMs * 0.8) {
        this.log(
          `Refresh reused persisted state: lastPollAt=${freshState.lastPollAt} ageMs=${Date.now() - freshState.lastPollAt} thresholdMs=${config.pollIntervalMs * 0.8}.`
        );
        this.state = freshState;
        this.emit();
        return;
      }
    }

    const lock = PollLock.forRefresh(config.sessionRoot);
    if (!await lock.tryAcquire()) {
      this.log('Refresh skipped: another instance holds the lock.');
      return;
    }

    this.running = true;
    this.emit();

      try {
        const parser = this.parserFactory(config);
        const artifactStore = config.useRpcExport ? new RpcArtifactStore(config.sessionRoot) : undefined;
        await this.refreshPricing();
        const scanResult = normalizeScanResult(await this.scanner.scan(config.sessionRoot), config.sessionRoot);
        if (!scanResult.complete) {
          this.lastError = scanResult.error ?? 'Session scan did not complete.';
          return;
        }

        const artifactManifests = !options?.skipExport && artifactStore
          ? (await new TrajectoryExporter(config, artifactStore, (message) => this.log(message)).exportChangedSessions(
              scanResult.sessions,
              { force: options?.force === true, selectiveForce: options?.selectiveForce === true }
            )).manifests
          : new Map();

        const capturedAt = Date.now();
        const nextSessions: PersistedState['sessions'] = { ...this.state.sessions };
        const seenIds = new Set<string>();
        let filesystemFallbackCandidates = 0;

        for (const candidate of scanResult.sessions) {
          const parsePlan = await resolveParsePlan(candidate, artifactStore, artifactManifests.get(candidate.sessionId));
          seenIds.add(candidate.sessionId);
          if (parsePlan.source !== 'rpc-artifact') {
            filesystemFallbackCandidates += 1;
            this.log(`Refresh falling back to filesystem session=${candidate.sessionId}.`);
          }
          const previous = this.state.sessions[candidate.sessionId];

          if (previous && previous.signature === parsePlan.analysisSignature && hasPricingBreakdown(previous.latest)) {
            this.log(`Refresh reused cached session=${candidate.sessionId} total=${previous.latest.totalTokens}.`);
            nextSessions[candidate.sessionId] = reactivatePersistedSession(previous, capturedAt, config.historyLimit);
            continue;
          }

          const latest = await parser.parse(parsePlan);
          const snapshot = this.calculator.calculate(previous, latest, capturedAt);
          this.log(
            `Refresh parsed session=${candidate.sessionId} source=${parsePlan.source} previousTotal=${previous?.latest.totalTokens ?? 0} latestTotal=${latest.totalTokens} deltaTotal=${snapshot.totalTokens}.`
          );
          nextSessions[candidate.sessionId] = {
            signature: parsePlan.analysisSignature,
            latest,
            snapshots: appendSnapshot(previous?.snapshots ?? [], snapshot, config.historyLimit),
            lifecycle: createActiveLifecycle(capturedAt)
          };
      }

        for (const sessionId of Object.keys(nextSessions)) {
          if (!seenIds.has(sessionId)) {
            nextSessions[sessionId] = archivePersistedSession(nextSessions[sessionId], capturedAt);
          }
        }

        if (filesystemFallbackCandidates > 0) {
          this.log(`Refresh used filesystem fallback for ${filesystemFallbackCandidates} session candidate(s).`);
        }

        this.state = {
          lastPollAt: capturedAt,
          sessions: nextSessions
      };
      this.lastError = undefined;
      this.log(`Refresh completed: trackedSessions=${Object.keys(nextSessions).length} capturedAt=${capturedAt}.`);
      await this.store.save(this.state);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Failed to refresh token data.';
      console.error('[antigravity-token-monitor]', error);
    } finally {
      this.running = false;
      await lock.release();
      this.emit();
    }
  }

  requestManualRefresh(): void {
    if (this.manualRefreshTimer) {
      clearTimeout(this.manualRefreshTimer);
    }

    this.manualRefreshTimer = setTimeout(() => {
      this.manualRefreshTimer = null;
      void this.refreshNow();
    }, TokenMonitorService.MANUAL_REFRESH_DELAY_MS);
  }

  async refreshNow(): Promise<number> {
    const exportedCount = await this.runExportCycle({ selectiveForce: true });
    await this.refresh({ skipExport: true, force: true, selectiveForce: true });
    return exportedCount;
  }

  async exportNow(options?: { force?: boolean; selectiveForce?: boolean; refreshAfter?: boolean }): Promise<number> {
    const exportedCount = await this.runExportCycle({ force: options?.force === true, selectiveForce: options?.selectiveForce === true });
    if (options?.refreshAfter !== false) {
      await this.refresh({ skipExport: true, force: true, selectiveForce: options?.selectiveForce === true });
    }
    return exportedCount;
  }

  restart(): void {
    this.stopTimer();
    this.stopExportTimer();
    this.startTimer();
    this.startExportTimer();
    void this.refresh({ force: true });
  }

  async resetCache(): Promise<number> {
    const config = this.configProvider();
    const artifactStore = new RpcArtifactStore(config.sessionRoot);
    const clearedCount = await artifactStore.clearAll();

    // 인메모리 상태도 완전 초기화
    this.state = { sessions: {} };
    await this.store.save(this.state);
    this.lastExportAt = undefined;
    this.lastExportedCount = 0;
    this.lastError = undefined;
    this.lastExportError = undefined;
    this.emit();

    // 처음부터 다시 Export + Refresh
    await this.exportNow({ force: true, refreshAfter: true });

    return clearedCount;
  }

  dispose(): void {
    this.stopTimer();
    this.stopExportTimer();
    if (this.manualRefreshTimer) {
      clearTimeout(this.manualRefreshTimer);
      this.manualRefreshTimer = null;
    }
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
    this.listeners.clear();
  }

  private startTimer(): void {
    const { pollIntervalMs } = this.configProvider();
    this.timer = setInterval(() => {
      void this.refresh();
    }, pollIntervalMs);
  }

  private startExportTimer(): void {
    const { useRpcExport, rpcExportIntervalMs } = this.configProvider();
    if (!useRpcExport) {
      return;
    }

    this.exportTimer = setInterval(() => {
      void this.exportNow({ force: false, refreshAfter: true });
    }, rpcExportIntervalMs);
    this.log(`Scheduled background export every ${rpcExportIntervalMs}ms.`);
  }

  private stopTimer(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  private stopExportTimer(): void {
    if (!this.exportTimer) {
      return;
    }

    clearInterval(this.exportTimer);
    this.exportTimer = null;
  }

  private async runExportCycle(options?: { force?: boolean; selectiveForce?: boolean }): Promise<number> {
    if (this.exportRunning) {
      this.log('Export skipped: service export is already running.');
      return 0;
    }

    const config = this.configProvider();
    if (!config.useRpcExport) {
      this.log('Export skipped: RPC export is disabled.');
      return 0;
    }

    this.log(`Export requested: force=${options?.force === true} selectiveForce=${options?.selectiveForce === true}.`);

    const exportLock = PollLock.forExport(config.sessionRoot);
    if (!await exportLock.tryAcquire()) {
      this.log('Export skipped: another instance holds the lock.');
      return 0;
    }

    this.exportRunning = true;
    this.emit();
    try {
      const scanResult = normalizeScanResult(await this.scanner.scan(config.sessionRoot), config.sessionRoot);
      if (!scanResult.complete) {
        this.lastExportError = scanResult.error ?? 'Session scan did not complete.';
        this.log(`Export skipped: ${this.lastExportError}`);
        return 0;
      }

      const artifactStore = new RpcArtifactStore(config.sessionRoot);
      const exportResult = await new TrajectoryExporter(config, artifactStore, (message) => this.log(message)).exportChangedSessions(
        scanResult.sessions,
        { force: options?.force === true, selectiveForce: options?.selectiveForce === true }
      );
      this.lastExportAt = Date.now();
      this.lastExportedCount = exportResult.exportedCount;
      this.lastExportError = undefined;
      this.log(`Export finished: ${exportResult.exportedCount} session(s) exported${options?.force ? ' (forced)' : ''}.`);
      return exportResult.exportedCount;
    } catch (error) {
      this.lastExportError = error instanceof Error ? error.message : 'Failed to export RPC artifacts.';
      this.log(`Export failed: ${this.lastExportError}`);
      console.error('[antigravity-token-monitor]', error);
      return 0;
    } finally {
      this.exportRunning = false;
      await exportLock.release();
      this.emit();
    }
  }

  private log(message: string): void {
    if (!this.configProvider().debug) {
      return;
    }

    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  private async refreshPricing(): Promise<void> {
    try {
      this.pricingState = {
        snapshot: await this.pricingCatalog.getSnapshot(),
        error: undefined
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh LiteLLM pricing data.';
      this.pricingState = {
        snapshot: this.pricingState.snapshot,
        error: message
      };
      this.log(message);
    }
  }

  private emit(): void {
    this.pendingEmit = true;
    if (this.emitTimer) {
      return;
    }

    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      if (!this.pendingEmit) {
        return;
      }

      this.pendingEmit = false;
      const payload = this.getDashboardState();
      for (const listener of this.listeners) {
        listener(payload);
      }
    }, TokenMonitorService.EMIT_DEBOUNCE_MS);
  }
}

function appendSnapshot(existing: SessionSnapshot[], next: SessionSnapshot, historyLimit: number): SessionSnapshot[] {
  const previous = existing[existing.length - 1];
  if (
    previous
    && previous.totalTokens === next.totalTokens
    && previous.inputTokens === next.inputTokens
    && previous.outputTokens === next.outputTokens
    && previous.cacheReadTokens === next.cacheReadTokens
    && previous.cacheWriteTokens === next.cacheWriteTokens
    && previous.reasoningTokens === next.reasoningTokens
  ) {
    return existing;
  }

  return [...existing, next].slice(-historyLimit);
}

function toDashboardSession(session: PersistedSessionState) {
  const source = session.latest.source ?? 'filesystem';
  const latestDelta = currentLatestDelta(session);

  return {
    sessionId: session.latest.sessionId,
    label: session.latest.label,
    filePath: session.latest.filePath,
    lastModifiedMs: session.latest.lastModifiedMs,
    status: session.lifecycle.status,
    lastSeenAt: session.lifecycle.lastSeenAt,
    archivedAt: session.lifecycle.archivedAt,
    mode: session.latest.mode,
    source,
    messageCount: session.latest.messageCount ?? 0,
    latest: totalsOnly(session.latest),
    latestDelta: totalsOnly(latestDelta),
    recentTotals: session.snapshots.slice(-12).map((snapshot) => snapshot.totalTokens),
    snapshotCount: session.snapshots.length
  };
}

function emptySnapshot(mode: TokenMode): SessionSnapshot {
  return emptySnapshotAt(mode, 0);
}

function emptySnapshotAt(mode: TokenMode, capturedAt: number): SessionSnapshot {
  return {
    capturedAt,
    mode,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0
  };
}

function totalsOnly(value: SessionTotals | SessionSnapshot) {
  return {
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    cacheReadTokens: value.cacheReadTokens,
    cacheWriteTokens: value.cacheWriteTokens,
    reasoningTokens: value.reasoningTokens,
    totalTokens: value.totalTokens
  };
}

function hasPricingBreakdown(latest: SessionTotals): boolean {
  return latest.mode === 'estimated' || latest.modelBreakdowns !== undefined;
}

function normalizePersistedState(state: PersistedState): PersistedState {
  return {
    lastPollAt: state.lastPollAt,
    sessions: Object.fromEntries(
      Object.entries(state.sessions).map(([sessionId, session]) => [sessionId, normalizePersistedSession(session)])
    )
  };
}

function normalizePersistedSession(session: PersistedSessionState): PersistedSessionState {
  const defaultLastSeenAt = session.latest.lastModifiedMs;
  return {
    ...session,
    lifecycle: session.lifecycle
      ? {
          status: session.lifecycle.status,
          lastSeenAt: session.lifecycle.lastSeenAt,
          archivedAt: session.lifecycle.archivedAt
        }
      : {
          status: 'active',
          lastSeenAt: defaultLastSeenAt
        }
  };
}

function createActiveLifecycle(lastSeenAt: number): SessionLifecycle {
  return {
    status: 'active',
    lastSeenAt
  };
}

function activatePersistedSession(session: PersistedSessionState, lastSeenAt: number): PersistedSessionState {
  return {
    ...session,
    lifecycle: createActiveLifecycle(lastSeenAt)
  };
}

function reactivatePersistedSession(
  session: PersistedSessionState,
  lastSeenAt: number,
  historyLimit: number
): PersistedSessionState {
  if (session.lifecycle.status !== 'archived') {
    return activatePersistedSession(session, lastSeenAt);
  }

  return {
    ...session,
    snapshots: appendSnapshot(session.snapshots, emptySnapshotAt(session.latest.mode, lastSeenAt), historyLimit),
    lifecycle: createActiveLifecycle(lastSeenAt)
  };
}

function archivePersistedSession(session: PersistedSessionState, archivedAt: number): PersistedSessionState {
  if (session.lifecycle.status === 'archived') {
    return session;
  }

  return {
    ...session,
    lifecycle: {
      status: 'archived',
      lastSeenAt: session.lifecycle.lastSeenAt,
      archivedAt
    }
  };
}

function normalizeScanResult(
  scanResult: Awaited<ReturnType<SessionScanner['scan']>>,
  sessionRoot: string
) {
  if (scanResult.complete || !isMissingBrainDirectoryError(scanResult.error, sessionRoot)) {
    return scanResult;
  }

  return {
    sessions: [],
    complete: true,
    error: undefined
  };
}

function isMissingBrainDirectoryError(error: string | undefined, sessionRoot: string): boolean {
  const brainDir = path.join(sessionRoot, 'brain');
  return error?.includes('ENOENT') === true
    && error.includes(brainDir)
    && (error.includes('scandir') || error.includes('readdir'));
}

function compareDashboardSessions(a: ReturnType<typeof toDashboardSession>, b: ReturnType<typeof toDashboardSession>): number {
  if (a.status !== b.status) {
    return a.status === 'active' ? -1 : 1;
  }

  return b.lastModifiedMs - a.lastModifiedMs;
}

function currentLatestDelta(session: PersistedSessionState): SessionSnapshot {
  if (session.lifecycle.status === 'archived') {
    return emptySnapshot(session.latest.mode);
  }

  return session.snapshots[session.snapshots.length - 1] ?? emptySnapshot(session.latest.mode);
}

function buildDashboardAnalytics(
  sessions: Record<string, PersistedSessionState>,
  lastExportedCount: number,
  pricingSnapshot?: LiteLlmPricingSnapshot,
  pricingError?: string,
  resolvePricing?: (model: string) => ReturnType<LiteLlmPricingCatalog['resolveModelPricing']>
): { analytics: DashboardAnalytics; pricing: DashboardState['pricing'] } {
  const sourceBreakdown: Record<TokenSource, SourceBreakdown> = {
    filesystem: { source: 'filesystem', sessionCount: 0, changedSessionCount: 0, totalTokens: 0 },
    'rpc-artifact': { source: 'rpc-artifact', sessionCount: 0, changedSessionCount: 0, totalTokens: 0 }
  };

  const modeBreakdown: Record<TokenMode, ModeBreakdown> = {
    estimated: { mode: 'estimated', sessionCount: 0, changedSessionCount: 0, totalTokens: 0 },
    reported: { mode: 'reported', sessionCount: 0, changedSessionCount: 0, totalTokens: 0 }
  };

  const heatmapBuckets = new Map<string, BucketAccumulator>();
  const modelTotals = new Map<string, ModelAccumulator>();

  for (const persisted of Object.values(sessions)) {
    const source = persisted.latest.source ?? 'filesystem';
    const mode = persisted.latest.mode ?? 'estimated';
    const latest = persisted.latest;
    const hasRecentActivity = persisted.lifecycle.status === 'active' && currentLatestDelta(persisted).totalTokens > 0;

    sourceBreakdown[source].sessionCount += 1;
    sourceBreakdown[source].totalTokens += latest.totalTokens;
    if (hasRecentActivity) {
      sourceBreakdown[source].changedSessionCount += 1;
    }

    modeBreakdown[mode].sessionCount += 1;
    modeBreakdown[mode].totalTokens += latest.totalTokens;
    if (hasRecentActivity) {
      modeBreakdown[mode].changedSessionCount += 1;
    }

    if (latest.totalTokens > 0) {
      const date = new Date(latest.lastModifiedMs);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const bucket = heatmapBuckets.get(dateKey);
      if (!bucket) {
        heatmapBuckets.set(dateKey, {
          totalTokens: latest.totalTokens,
          inputTokens: latest.inputTokens,
          outputTokens: latest.outputTokens,
          cacheReadTokens: latest.cacheReadTokens,
          cacheWriteTokens: latest.cacheWriteTokens,
          reasoningTokens: latest.reasoningTokens,
          costUsd: 0,
          messageCount: latest.messageCount ?? 0,
          sessionIds: new Set([latest.sessionId])
        });
      } else {
        bucket.totalTokens += latest.totalTokens;
        bucket.inputTokens += latest.inputTokens;
        bucket.outputTokens += latest.outputTokens;
        bucket.cacheReadTokens += latest.cacheReadTokens;
        bucket.cacheWriteTokens += latest.cacheWriteTokens;
        bucket.reasoningTokens += latest.reasoningTokens;
        bucket.messageCount += latest.messageCount ?? 0;
        bucket.sessionIds.add(latest.sessionId);
      }
    }

    if (persisted.latest.modelBreakdowns) {
      for (const [model, breakdown] of Object.entries(persisted.latest.modelBreakdowns)) {
        const next = modelTotals.get(model) ?? emptyModelAccumulator();
        next.totalTokens += breakdown.totalTokens;
        next.sessionIds.add(persisted.latest.sessionId);
        next.breakdownAvailable = true;
        next.inputTokens += breakdown.inputTokens;
        next.outputTokens += breakdown.outputTokens;
        next.cacheReadTokens += breakdown.cacheReadTokens;
        next.cacheWriteTokens += breakdown.cacheWriteTokens;
        next.reasoningTokens += breakdown.reasoningTokens;
        modelTotals.set(model, next);
      }
    } else if (persisted.latest.modelTotals) {
      for (const [model, total] of Object.entries(persisted.latest.modelTotals)) {
        if (total <= 0) {
          continue;
        }
        const next = modelTotals.get(model) ?? emptyModelAccumulator();
        next.totalTokens += total;
        next.sessionIds.add(persisted.latest.sessionId);
        modelTotals.set(model, next);
      }
    }
  }

  const sourceBreakdownValues = Object.values(sourceBreakdown);
  const modeBreakdownValues = Object.values(modeBreakdown);

  const activityHeatmap: ActivityHeatmapBin[] = [];
  const today = new Date();
  // Include data backwards from today to 180 days ago
  for (let i = 180; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = heatmapBuckets.get(dateKey);
    activityHeatmap.push({
      date: dateKey,
      totalTokens: bucket?.totalTokens ?? 0,
      sessionCount: bucket?.sessionIds.size ?? 0,
      inputTokens: bucket?.inputTokens ?? 0,
      outputTokens: bucket?.outputTokens ?? 0,
      cacheReadTokens: bucket?.cacheReadTokens ?? 0,
      cacheWriteTokens: bucket?.cacheWriteTokens ?? 0,
      reasoningTokens: bucket?.reasoningTokens ?? 0,
      costUsd: bucket?.costUsd ?? 0,
      messageCount: bucket?.messageCount ?? 0
    });
  }

  const unavailableNote = pricingSnapshot ? 'No LiteLLM pricing match.' : pricingError ?? 'LiteLLM pricing data unavailable.';
  const modelUsage = Array.from(modelTotals.entries())
    .map(([model, accumulator]): ModelUsageBreakdown => {
      const costResult = calculateModelCost(
        accumulator.breakdownAvailable
          ? {
              inputTokens: accumulator.inputTokens,
              outputTokens: accumulator.outputTokens,
              cacheReadTokens: accumulator.cacheReadTokens,
              cacheWriteTokens: accumulator.cacheWriteTokens,
              reasoningTokens: accumulator.reasoningTokens,
              totalTokens: accumulator.totalTokens
            }
          : undefined,
        pricingSnapshot ? resolvePricing?.(model) : undefined,
        unavailableNote
      );

      return {
        model,
        totalTokens: accumulator.totalTokens,
        sessionCount: accumulator.sessionIds.size,
        costUsd: costResult.costUsd,
        pricingStatus: costResult.pricingStatus,
        pricingNote: costResult.pricingNote
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const missingModels = modelUsage
    .filter((entry) => entry.pricingStatus === 'unpriced')
    .map((entry) => entry.model);
  const totalCostUsd = modelUsage.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);
  const pricedModelCount = modelUsage.length - missingModels.length;
  
  const totalDashboardTokens = Object.values(sessions).reduce((s, p) => s + p.latest.totalTokens, 0);
  const avgCostPerToken = totalDashboardTokens > 0 ? totalCostUsd / totalDashboardTokens : 0;

  for (const bin of activityHeatmap) {
    bin.costUsd = bin.totalTokens * avgCostPerToken;
  }

  const pricing: DashboardState['pricing'] = {
    status: pricingError && !pricingSnapshot
      ? 'error'
      : missingModels.length === 0
        ? (pricedModelCount > 0 ? 'ready' : 'unavailable')
        : pricedModelCount > 0
          ? 'partial'
          : 'unavailable',
    totalCostUsd,
    pricedModelCount,
    unpricedModelCount: missingModels.length,
    missingModels,
    lastUpdatedAt: pricingSnapshot?.fetchedAt,
    message: buildPricingMessage(pricingSnapshot, pricingError, pricedModelCount, missingModels.length)
  };

  const trackedSessions = Object.keys(sessions).length;
  const changedSessions = Object.values(sessions).filter(
    (persisted) => persisted.lifecycle.status === 'active' && currentLatestDelta(persisted).totalTokens > 0
  ).length;
  const rpcCoverage: RpcCoverageBreakdown = {
    trackedSessions,
    exportedSessions: trackedSessions,
    skippedSessions: Math.max(0, lastExportedCount > 0 ? trackedSessions - lastExportedCount : 0),
    changedSessions
  };

  return {
    analytics: {
      activityHeatmap,
      sourceBreakdown: sourceBreakdownValues,
      modeBreakdown: modeBreakdownValues,
      modelUsage,
      rpcCoverage
    },
    pricing
  };
}

function emptyModelAccumulator(): ModelAccumulator {
  return {
    totalTokens: 0,
    sessionIds: new Set<string>(),
    breakdownAvailable: false,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0
  };
}

function buildPricingMessage(
  pricingSnapshot: LiteLlmPricingSnapshot | undefined,
  pricingError: string | undefined,
  pricedModelCount: number,
  missingModelCount: number
): string {
  if (pricingError && !pricingSnapshot) {
    return pricingError;
  }

  if (!pricingSnapshot) {
    return 'LiteLLM pricing data has not been loaded yet.';
  }

  if (missingModelCount > 0) {
    return `Priced ${pricedModelCount} model${pricedModelCount === 1 ? '' : 's'}; ${missingModelCount} unmatched.`;
  }

  if (pricedModelCount === 0) {
    return 'LiteLLM pricing loaded, but no models are priceable yet.';
  }

  return `LiteLLM pricing loaded for ${pricedModelCount} model${pricedModelCount === 1 ? '' : 's'}.`;
}
