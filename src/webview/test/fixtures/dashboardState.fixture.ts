import type { DashboardState } from '../../../types';

export const mockDashboardState: DashboardState = {
  rootPath: '/mock/path',
  config: {
    useRpcExport: true,
    exportStepsJsonl: false
  },
  lastPollAt: 1600000000000,
  syncStatus: 'idle',
  syncMessage: 'Synced',
  exportStatus: {
    status: 'idle',
    message: 'Exported',
    lastExportAt: 1600000000000,
    lastExportedCount: 5
  },
  sessions: [
    {
      sessionId: 'session-1',
      label: 'Session 1',
      filePath: '/mock/path/session-1',
      lastModifiedMs: 1600000000000,
      mode: 'reported',
      source: 'rpc-artifact',
      messageCount: 12,
      latest: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 20,
        cacheWriteTokens: 10,
        reasoningTokens: 20,
        totalTokens: 200
      },
      latestDelta: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        totalTokens: 15
      },
      recentTotals: [100, 120, 150],
      snapshotCount: 3
    },
    {
      sessionId: 'session-2',
      label: 'Session 2',
      filePath: '/mock/path/session-2',
      lastModifiedMs: 1600000001000,
      mode: 'estimated',
      source: 'filesystem',
      messageCount: 8,
      latest: {
        inputTokens: 200,
        outputTokens: 100,
        cacheReadTokens: 40,
        cacheWriteTokens: 20,
        reasoningTokens: 40,
        totalTokens: 400
      },
      latestDelta: {
        inputTokens: 20,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        totalTokens: 30
      },
      recentTotals: [200, 250, 300],
      snapshotCount: 3
    }
  ],
  summary: {
    sessionCount: 2,
    messageCount: 20,
    changedSessionCount: 1,
    totalTokens: 600,
    estimatedSessionCount: 1
  },
  pricing: {
    status: 'partial',
    totalCostUsd: 0.0041,
    pricedModelCount: 1,
    unpricedModelCount: 1,
    missingModels: ['unknown-model'],
    lastUpdatedAt: 1600000000000,
    message: 'Priced 1 model; 1 unmatched.'
  },
  analytics: {
    activityHeatmap: [
      {
        date: '2023-01-01',
        totalTokens: 0,
        sessionCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        costUsd: 0,
        messageCount: 0
      }
    ],
    sourceBreakdown: [
      { source: 'filesystem', sessionCount: 1, changedSessionCount: 0, totalTokens: 400 },
      { source: 'rpc-artifact', sessionCount: 1, changedSessionCount: 1, totalTokens: 200 }
    ],
    modeBreakdown: [
      { mode: 'reported', sessionCount: 1, changedSessionCount: 1, totalTokens: 200 },
      { mode: 'estimated', sessionCount: 1, changedSessionCount: 0, totalTokens: 400 }
    ],
    modelUsage: [
      {
        model: 'mock-model',
        totalTokens: 450,
        sessionCount: 1,
        costUsd: 0.0041,
        pricingStatus: 'priced'
      },
      {
        model: 'unknown-model',
        totalTokens: 150,
        sessionCount: 1,
        pricingStatus: 'unpriced',
        pricingNote: 'No LiteLLM pricing match.'
      }
    ],
    rpcCoverage: {
      trackedSessions: 2,
      exportedSessions: 2,
      skippedSessions: 0,
      changedSessions: 1
    }
  }
};
