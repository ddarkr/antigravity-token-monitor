import { describe, expect, it } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { ProcessLocator } from './processLocator';
import { AntigravityRpcClient } from './antigravityRpcClient';
import { SessionScanner } from '../monitor/sessionScanner';
import { RpcArtifactStore } from '../storage/rpcArtifactStore';
import { TrajectoryExporter } from './trajectoryExporter';
import { AntigravitySessionParser } from '../parser/antigravitySessionParser';
import { resolveParsePlan } from '../monitor/sourceResolver';
import { LiteLlmPricingCatalog, calculateModelCost } from '../pricing/litellmPricing';
import { getDefaultSessionRoot, getDefaultSessionRoots, MonitorConfig } from '../config';

describe('New Antigravity IDE Live Pipeline Test', () => {
  const sessionRoot = getDefaultSessionRoot();

  const config: MonitorConfig = {
    sessionRoot,
    sessionRoots: getDefaultSessionRoots(),
    debug: true,
    pollIntervalMs: 60000,
    historyLimit: 120,
    maxFileBytes: 10 * 1024 * 1024,
    useRpcExport: true,
    exportStepsJsonl: true,
    rpcExportIntervalMs: 300000,
    rpcTimeoutMs: 5000
  };

  it('Step 1: ProcessLocator detects live agy daemon via HTTP', async () => {
    const logs: string[] = [];
    const locator = new ProcessLocator((msg) => logs.push(msg));
    const conn = await locator.detectConnection();

    expect(conn).not.toBeNull();
    expect(conn!.pid).toBeGreaterThan(0);
    expect(conn!.port).toBeGreaterThan(0);
    expect(conn!.csrfToken.length).toBeGreaterThan(10);
    console.log(`[LIVE TEST] Located agy process: PID=${conn!.pid}, Port=${conn!.port}`);
  });

  it('Step 2: AntigravityRpcClient interacts with live agy RPC endpoints', async () => {
    const logs: string[] = [];
    const client = new AntigravityRpcClient(config, (msg) => logs.push(msg));
    const summaries = await client.listTrajectories();

    expect(Array.isArray(summaries)).toBe(true);
    expect(summaries.length).toBeGreaterThan(0);
    console.log(`[LIVE TEST] Found ${summaries.length} trajectories in live RPC.`);

    const activeSession = summaries[0];
    console.log(`[LIVE TEST] Active session ID: ${activeSession.sessionId}, stepCount: ${activeSession.stepCount}`);

    const steps = await client.getTrajectorySteps(activeSession.sessionId);
    expect(Array.isArray(steps)).toBe(true);
    console.log(`[LIVE TEST] Fetched ${steps.length} steps from RPC.`);

    const metadata = await client.getTrajectoryMetadata(activeSession.sessionId);
    expect(Array.isArray(metadata)).toBe(true);
    console.log(`[LIVE TEST] Fetched ${metadata.length} generator metadata rows.`);
  });

  it('Step 3: SessionScanner discovers brain sessions and SQLite .db files', async () => {
    const scanner = new SessionScanner();
    const scanResult = await scanner.scan(config.sessionRoots);

    expect(scanResult.complete).toBe(true);
    expect(scanResult.sessions.length).toBeGreaterThan(0);

    const first = scanResult.sessions[0];
    expect(first.sessionId).toBeTruthy();
    expect(first.filePaths.length).toBeGreaterThan(0);
    console.log(`[LIVE TEST] Scanner found ${scanResult.sessions.length} sessions. Latest: ${first.sessionId}`);
    console.log(`[LIVE TEST] SQLite DB detected: ${first.pbPath ?? 'none'}`);
  });

  it('Step 4: End-to-end export, parse, and cost calculation for live session', async () => {
    const scanner = new SessionScanner();
    const scanResult = await scanner.scan(config.sessionRoots);
    expect(scanResult.sessions.length).toBeGreaterThan(0);

    const artifactStore = new RpcArtifactStore(config.sessionRoot);
    const exporter = new TrajectoryExporter(config, artifactStore);
    const exportResult = await exporter.exportChangedSessions(scanResult.sessions.slice(0, 3), { force: true });

    expect(exportResult.exportedCount).toBeGreaterThan(0);
    console.log(`[LIVE TEST] Exported ${exportResult.exportedCount} session(s) to RPC artifacts.`);

    const targetSession = scanResult.sessions[0];
    const parsePlan = await resolveParsePlan(targetSession, artifactStore);
    expect(parsePlan.source).toBe('rpc-artifact');

    const parser = new AntigravitySessionParser(config.maxFileBytes);
    const totals = await parser.parse(parsePlan);

    expect(totals.mode).toBe('reported');
    expect(totals.totalTokens).toBeGreaterThan(0);
    expect(totals.evidenceCount).toBeGreaterThan(0);

    console.log(`[LIVE TEST] Parsed session totals:`);
    console.log(`  - Total Tokens: ${totals.totalTokens.toLocaleString()}`);
    console.log(`  - Input Tokens: ${totals.inputTokens.toLocaleString()}`);
    console.log(`  - Output Tokens: ${totals.outputTokens.toLocaleString()}`);
    console.log(`  - Cache Read Tokens: ${totals.cacheReadTokens.toLocaleString()}`);
    console.log(`  - Reasoning Tokens: ${totals.reasoningTokens.toLocaleString()}`);
    console.log(`  - Message Count: ${totals.messageCount}`);
    console.log(`  - Models Used:`, Object.keys(totals.modelTotals ?? {}));

    const catalog = new LiteLlmPricingCatalog();
    const snapshot = await catalog.getSnapshot();
    expect(snapshot.priceMap).toBeDefined();

    for (const [model, count] of Object.entries(totals.modelTotals ?? {})) {
      const breakdown = totals.modelBreakdowns?.[model];
      const pricing = catalog.resolveModelPricing(model);
      const cost = calculateModelCost(breakdown ?? {
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
        reasoningTokens: totals.reasoningTokens,
        totalTokens: count
      }, pricing, 'No pricing');
      console.log(`  - Model [${model}] ${count} tokens => Cost status: ${cost.pricingStatus}, USD: ${cost.costUsd !== undefined ? '$' + cost.costUsd.toFixed(4) : 'unpriced'}`);
    }
  });
});
