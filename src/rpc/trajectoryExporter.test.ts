import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MonitorConfig } from '../config';
import type { SessionScanCandidate } from '../types';
import { RpcArtifactStore } from '../storage/rpcArtifactStore';
import { AntigravityRpcClient } from './antigravityRpcClient';
import { TrajectoryExporter } from './trajectoryExporter';

describe('TrajectoryExporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries summary discovery immediately after resetting the RPC connection cache', async () => {
    const logs: string[] = [];
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-exporter-'));
    const artifactStore = new RpcArtifactStore(sessionRoot);

    const flushSpy = vi.spyOn(AntigravityRpcClient.prototype, 'flush').mockResolvedValue();
    const listSpy = vi.spyOn(AntigravityRpcClient.prototype, 'listTrajectories')
      .mockRejectedValueOnce(new Error('summary fetch failed'))
      .mockResolvedValueOnce([{ sessionId: 'session-1', lastModifiedMs: 123, stepCount: 1 }]);
    const resetSpy = vi.spyOn(AntigravityRpcClient.prototype, 'resetConnection').mockImplementation(() => {});
    const stepsSpy = vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectorySteps').mockResolvedValue([{ id: 'step-1' }]);
    const metadataSpy = vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectoryMetadata').mockResolvedValue([
      { responseModel: 'gemini-2.5-pro', chatModel: { usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 } } }
    ]);

    const exporter = new TrajectoryExporter(buildConfig(sessionRoot), artifactStore, (message) => logs.push(message));

    const result = await exporter.exportChangedSessions([buildCandidate(sessionRoot)]);

    expect(flushSpy).toHaveBeenCalledTimes(2);
    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(stepsSpy).toHaveBeenCalledTimes(1);
    expect(metadataSpy).toHaveBeenCalledTimes(1);
    expect(result.exportedCount).toBe(1);
    expect(result.manifests.size).toBe(1);
    expect(logs).toContain('TrajectoryExporter: resetting RPC connection cache and retrying summary fetch immediately.');
    expect(logs.some((message) => message.includes('RPC summary fetch failed on attempt 1/2: summary fetch failed'))).toBe(true);
  });

  it('retries per-session payload export immediately after a session RPC failure', async () => {
    const logs: string[] = [];
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-exporter-'));
    const artifactStore = new RpcArtifactStore(sessionRoot);

    vi.spyOn(AntigravityRpcClient.prototype, 'flush').mockResolvedValue();
    vi.spyOn(AntigravityRpcClient.prototype, 'listTrajectories').mockResolvedValue([
      { sessionId: 'session-1', lastModifiedMs: 123, stepCount: 1 }
    ]);
    const resetSpy = vi.spyOn(AntigravityRpcClient.prototype, 'resetConnection').mockImplementation(() => {});
    const stepsSpy = vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectorySteps')
      .mockRejectedValueOnce(new Error('steps fetch failed'))
      .mockResolvedValueOnce([{ id: 'step-1' }]);
    const metadataSpy = vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectoryMetadata').mockResolvedValue([
      { responseModel: 'gemini-2.5-pro', chatModel: { usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 } } }
    ]);

    const exporter = new TrajectoryExporter(buildConfig(sessionRoot), artifactStore, (message) => logs.push(message));

    const result = await exporter.exportChangedSessions([buildCandidate(sessionRoot)]);

    expect(stepsSpy).toHaveBeenCalledTimes(2);
    expect(metadataSpy).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(result.exportedCount).toBe(1);
    expect(logs).toContain('TrajectoryExporter: session=session-1 resetting RPC connection cache and retrying immediately.');
    expect(logs.some((message) => message.includes('session=session-1 RPC payload fetch failed on attempt 1/2: steps fetch failed'))).toBe(true);
  });

  it('retries metadata export immediately after a metadata RPC failure', async () => {
    const logs: string[] = [];
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-exporter-'));
    const artifactStore = new RpcArtifactStore(sessionRoot);

    vi.spyOn(AntigravityRpcClient.prototype, 'flush').mockResolvedValue();
    vi.spyOn(AntigravityRpcClient.prototype, 'listTrajectories').mockResolvedValue([
      { sessionId: 'session-1', lastModifiedMs: 123, stepCount: 1 }
    ]);
    const resetSpy = vi.spyOn(AntigravityRpcClient.prototype, 'resetConnection').mockImplementation(() => {});
    const stepsSpy = vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectorySteps').mockResolvedValue([{ id: 'step-1' }]);
    const metadataSpy = vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectoryMetadata')
      .mockRejectedValueOnce(new Error('metadata fetch failed'))
      .mockResolvedValueOnce([
        { responseModel: 'gemini-2.5-pro', chatModel: { usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 } } }
      ]);

    const exporter = new TrajectoryExporter(buildConfig(sessionRoot), artifactStore, (message) => logs.push(message));

    const result = await exporter.exportChangedSessions([buildCandidate(sessionRoot)]);

    expect(stepsSpy).toHaveBeenCalledTimes(2);
    expect(metadataSpy).toHaveBeenCalledTimes(2);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(result.exportedCount).toBe(1);
    expect(logs).toContain('TrajectoryExporter: session=session-1 resetting RPC connection cache and retrying immediately.');
    expect(logs.some((message) => message.includes('session=session-1 RPC payload fetch failed on attempt 1/2: metadata fetch failed'))).toBe(true);
  });

  it('logs and exits cleanly when summary discovery still fails after the immediate retry', async () => {
    const logs: string[] = [];
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-exporter-'));
    const artifactStore = new RpcArtifactStore(sessionRoot);

    vi.spyOn(AntigravityRpcClient.prototype, 'flush').mockResolvedValue();
    const listSpy = vi.spyOn(AntigravityRpcClient.prototype, 'listTrajectories')
      .mockRejectedValue(new Error('rpc unavailable'));
    const resetSpy = vi.spyOn(AntigravityRpcClient.prototype, 'resetConnection').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const exporter = new TrajectoryExporter(buildConfig(sessionRoot), artifactStore, (message) => logs.push(message));

    const result = await exporter.exportChangedSessions([buildCandidate(sessionRoot)]);

    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(result.exportedCount).toBe(0);
    expect(result.manifests.size).toBe(0);
    expect(logs.some((message) => message.includes('RPC export unavailable after retry: rpc unavailable'))).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith('[antigravity-token-monitor] RPC export unavailable:', expect.any(Error));
  });

  it('records a failure and continues when a session payload still fails after retry', async () => {
    const logs: string[] = [];
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-exporter-'));
    const artifactStore = new RpcArtifactStore(sessionRoot);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.spyOn(AntigravityRpcClient.prototype, 'flush').mockResolvedValue();
    vi.spyOn(AntigravityRpcClient.prototype, 'listTrajectories').mockResolvedValue([
      { sessionId: 'session-1', lastModifiedMs: 123, stepCount: 1 },
      { sessionId: 'session-2', lastModifiedMs: 456, stepCount: 1 }
    ]);
    const resetSpy = vi.spyOn(AntigravityRpcClient.prototype, 'resetConnection').mockImplementation(() => {});
    const stepsSpy = vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectorySteps')
      .mockRejectedValueOnce(new Error('session-1 failed first'))
      .mockRejectedValueOnce(new Error('session-1 failed second'))
      .mockResolvedValueOnce([{ id: 'step-2' }]);
    const metadataSpy = vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectoryMetadata').mockResolvedValue([
      { responseModel: 'gemini-2.5-pro', chatModel: { usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } } }
    ]);

    const result = await exporterFor(sessionRoot, artifactStore, logs).exportChangedSessions([
      buildCandidate(sessionRoot),
      buildCandidate(sessionRoot, 'session-2', 456)
    ]);

    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(stepsSpy).toHaveBeenCalledTimes(3);
    expect(metadataSpy).toHaveBeenCalledTimes(1);
    expect(result.exportedCount).toBe(1);
    expect(result.manifests.has('session-2')).toBe(true);
    expect(logs.some((message) => message.includes('session=session-1 export failure recorded: session-1 failed second'))).toBe(true);

    const failedManifest = await artifactStore.loadManifest('session-1');
    expect(failedManifest?.failureCount).toBe(1);
    expect(failedManifest?.lastError).toBe('session-1 failed second');
  });

  it('does not double-count retryInfos or thinkingOutputTokens inside outputTokens', async () => {
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-exporter-'));
    const artifactStore = new RpcArtifactStore(sessionRoot);

    vi.spyOn(AntigravityRpcClient.prototype, 'flush').mockResolvedValue();
    vi.spyOn(AntigravityRpcClient.prototype, 'listTrajectories').mockResolvedValue([
      { sessionId: 'session-retry', lastModifiedMs: 123, stepCount: 1 }
    ]);
    vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectorySteps').mockResolvedValue([{ id: 'step-1' }]);
    vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectoryMetadata').mockResolvedValue([
      {
        chatModel: {
          model: 'MODEL_PLACEHOLDER_M318',
          responseModel: 'gemini-3.8-flash-h',
          usage: {
            inputTokens: '1000',
            outputTokens: '300',
            thinkingOutputTokens: '200',
            responseOutputTokens: '100',
            cacheReadTokens: '500'
          },
          retryInfos: [
            {
              usage: {
                inputTokens: '1000',
                outputTokens: '300',
                thinkingOutputTokens: '200',
                responseOutputTokens: '100',
                cacheReadTokens: '500'
              }
            }
          ]
        }
      }
    ]);

    const result = await exporterFor(sessionRoot, artifactStore, []).exportChangedSessions([
      buildCandidate(sessionRoot, 'session-retry', 123)
    ]);
    expect(result.exportedCount).toBe(1);

    const tokenFiles = await artifactStore.getTokenFilePaths('session-retry');
    const usageFile = tokenFiles.find((p) => p.endsWith('usage.jsonl'))!;
    const usageRow = JSON.parse((await readFile(usageFile, 'utf8')).trim());
    expect(usageRow.model).toBe('gemini-3.8-flash-h');
    expect(usageRow.inputTokens).toBe(1000);
    expect(usageRow.outputTokens).toBe(100);
    expect(usageRow.reasoningTokens).toBe(200);
    expect(usageRow.cacheReadTokens).toBe(500);
    expect(usageRow.totalTokens).toBe(1800);
    expect(usageRow.raw).toBeUndefined();
  });

  it('preserves existing valid artifacts when RPC returns empty payload on refresh', async () => {
    const sessionRoot = await mkdtemp(path.join(tmpdir(), 'antigravity-exporter-'));
    const artifactStore = new RpcArtifactStore(sessionRoot);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(AntigravityRpcClient.prototype, 'flush').mockResolvedValue();
    vi.spyOn(AntigravityRpcClient.prototype, 'listTrajectories').mockResolvedValue([
      { sessionId: 'session-keep', lastModifiedMs: 100, stepCount: 2 }
    ]);
    vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectorySteps')
      .mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }])
      .mockResolvedValue([]);
    vi.spyOn(AntigravityRpcClient.prototype, 'getTrajectoryMetadata')
      .mockResolvedValueOnce([{ chatModel: { responseModel: 'gemini-3.8-flash-h', usage: { inputTokens: 50, outputTokens: 10 } } }])
      .mockResolvedValue([]);

    await exporterFor(sessionRoot, artifactStore, []).exportChangedSessions([
      buildCandidate(sessionRoot, 'session-keep', 100)
    ]);

    const usageBefore = await readFile((await artifactStore.getTokenFilePaths('session-keep')).find((p) => p.endsWith('usage.jsonl'))!, 'utf8');
    expect(usageBefore.trim().length).toBeGreaterThan(0);

    // Next cycle returns empty payload while serverLastModifiedMs moved
    vi.spyOn(AntigravityRpcClient.prototype, 'listTrajectories').mockResolvedValue([
      { sessionId: 'session-keep', lastModifiedMs: 200, stepCount: 2 }
    ]);
    const second = await exporterFor(sessionRoot, artifactStore, []).exportChangedSessions([
      buildCandidate(sessionRoot, 'session-keep', 200)
    ]);
    expect(second.exportedCount).toBe(0);

    const usageAfter = await readFile((await artifactStore.getTokenFilePaths('session-keep')).find((p) => p.endsWith('usage.jsonl'))!, 'utf8');
    expect(usageAfter).toBe(usageBefore);
    const manifest = await artifactStore.loadManifest('session-keep');
    expect(manifest?.failureCount).toBe(1);
  });
});

function exporterFor(sessionRoot: string, artifactStore: RpcArtifactStore, logs: string[]): TrajectoryExporter {
  return new TrajectoryExporter(buildConfig(sessionRoot), artifactStore, (message) => logs.push(message));
}

function buildConfig(sessionRoot: string): MonitorConfig {
  return {
    sessionRoot,
    sessionRoots: [sessionRoot],
    debug: false,
    pollIntervalMs: 60000,
    historyLimit: 120,
    maxFileBytes: 1024,
    useRpcExport: true,
    exportStepsJsonl: false,
    rpcExportIntervalMs: 300000,
    rpcTimeoutMs: 5000
  };
}

function buildCandidate(sessionRoot: string, sessionId = 'session-1', lastModifiedMs = 123): SessionScanCandidate {
  return {
    sessionId,
    sessionDir: path.join(sessionRoot, 'brain', sessionId),
    filePaths: [],
    labelHint: `Session ${sessionId}`,
    lastModifiedMs,
    signature: `sig-${sessionId}`
  };
}
