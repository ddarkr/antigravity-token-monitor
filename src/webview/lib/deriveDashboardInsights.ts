import type { DashboardState, TokenBreakdown, ModelUsageBreakdown, DashboardPricingSummary } from '../../types';

export type DateFilterOption = {
  range: 'all' | 'today' | '24h' | '7d' | '30d' | 'custom';
  customStart?: string;
  customEnd?: string;
};

type DerivedDashboardInsights = DashboardState & {
  tokenBreakdown: TokenBreakdown;
  hasSessions: boolean;
  sortedSessions: DashboardState['sessions'];
  dateFilter: DateFilterOption;
};

export function deriveDashboardInsights(state: DashboardState, filter: DateFilterOption = { range: 'all' }): DerivedDashboardInsights {
  const now = Date.now();
  let startMs = 0;
  let endMs = Infinity;

  if (filter.range === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startMs = today.getTime();
  } else if (filter.range === '24h') {
    startMs = now - 24 * 60 * 60 * 1000;
  } else if (filter.range === '7d') {
    startMs = now - 7 * 24 * 60 * 60 * 1000;
  } else if (filter.range === '30d') {
    startMs = now - 30 * 24 * 60 * 60 * 1000;
  } else if (filter.range === 'custom') {
    if (filter.customStart) {
      startMs = new Date(`${filter.customStart}T00:00:00`).getTime();
    }
    if (filter.customEnd) {
      endMs = new Date(`${filter.customEnd}T23:59:59`).getTime();
    }
  }

  // Filter sessions by lastModifiedMs
  const filteredSessions = state.sessions.filter(s => {
    if (filter.range === 'all') return true;
    return s.lastModifiedMs >= startMs && s.lastModifiedMs <= endMs;
  });

  const tokenBreakdown: TokenBreakdown = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };

  let totalMessages = 0;
  const filteredModelMap = new Map<string, {
    totalTokens: number;
    sessionIds: Set<string>;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
  }>();

  for (const session of filteredSessions) {
    tokenBreakdown.inputTokens += session.latest.inputTokens || 0;
    tokenBreakdown.outputTokens += session.latest.outputTokens || 0;
    tokenBreakdown.cacheReadTokens += session.latest.cacheReadTokens || 0;
    tokenBreakdown.cacheWriteTokens += session.latest.cacheWriteTokens || 0;
    tokenBreakdown.reasoningTokens += session.latest.reasoningTokens || 0;
    tokenBreakdown.totalTokens += session.latest.totalTokens || 0;
    totalMessages += session.messageCount || 0;

    if (session.modelBreakdowns && Object.keys(session.modelBreakdowns).length > 0) {
      for (const [model, mb] of Object.entries(session.modelBreakdowns)) {
        if (!filteredModelMap.has(model)) {
          filteredModelMap.set(model, {
            totalTokens: 0,
            sessionIds: new Set(),
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0
          });
        }
        const acc = filteredModelMap.get(model)!;
        acc.totalTokens += mb.totalTokens || 0;
        acc.inputTokens += mb.inputTokens || 0;
        acc.outputTokens += mb.outputTokens || 0;
        acc.cacheReadTokens += mb.cacheReadTokens || 0;
        acc.cacheWriteTokens += mb.cacheWriteTokens || 0;
        acc.reasoningTokens += mb.reasoningTokens || 0;
        acc.sessionIds.add(session.sessionId);
      }
    } else if (session.modelTotals && Object.keys(session.modelTotals).length > 0) {
      for (const [model, count] of Object.entries(session.modelTotals)) {
        if (count <= 0) continue;
        if (!filteredModelMap.has(model)) {
          filteredModelMap.set(model, {
            totalTokens: 0,
            sessionIds: new Set(),
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0
          });
        }
        const acc = filteredModelMap.get(model)!;
        acc.totalTokens += count;
        acc.sessionIds.add(session.sessionId);
      }
    }
  }

  const activeCount = filteredSessions.filter(s => s.status === 'active').length;
  const archivedCount = filteredSessions.filter(s => s.status === 'archived').length;

  const totalTokensFiltered = tokenBreakdown.totalTokens;
  const totalTokensOverall = Math.max(state.summary.totalTokens, 1);
  const tokenRatio = filter.range === 'all' ? 1 : (totalTokensFiltered / totalTokensOverall);

  // Build modelUsage
  let modelUsage: ModelUsageBreakdown[] = [];
  if (filter.range === 'all') {
    modelUsage = state.analytics.modelUsage;
  } else if (filteredModelMap.size > 0) {
    // Exact per-session model breakdown
    for (const [model, acc] of filteredModelMap.entries()) {
      if (acc.totalTokens <= 0) continue;
      const baseInfo = state.analytics.modelUsage.find(m => m.model === model);
      let costUsd: number | undefined;

      if (baseInfo && baseInfo.costUsd !== undefined && baseInfo.totalTokens > 0) {
        costUsd = (baseInfo.costUsd / baseInfo.totalTokens) * acc.totalTokens;
      }

      modelUsage.push({
        model,
        totalTokens: acc.totalTokens,
        sessionCount: acc.sessionIds.size,
        costUsd,
        pricingStatus: baseInfo?.pricingStatus ?? 'unpriced',
        pricingNote: baseInfo?.pricingNote
      });
    }
    modelUsage.sort((a, b) => b.totalTokens - a.totalTokens);
  } else if (totalTokensFiltered > 0 && state.analytics.modelUsage.length > 0) {
    // Fallback: If sessions lack per-model telemetry, scale known models
    modelUsage = state.analytics.modelUsage
      .map(item => {
        const tokens = Math.round(item.totalTokens * tokenRatio);
        const cost = item.costUsd !== undefined ? item.costUsd * tokenRatio : undefined;
        const sCount = Math.max(tokens > 0 ? 1 : 0, Math.min(item.sessionCount, filteredSessions.length));
        return {
          ...item,
          totalTokens: tokens,
          sessionCount: sCount,
          costUsd: cost
        };
      })
      .filter(item => item.totalTokens > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }

  const totalCostUsd = filter.range === 'all'
    ? state.pricing.totalCostUsd
    : modelUsage.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);

  const pricedModelCount = modelUsage.filter(m => m.pricingStatus === 'priced' && m.costUsd !== undefined).length;

  const pricing: DashboardPricingSummary = {
    ...state.pricing,
    totalCostUsd,
    pricedModelCount,
    message: filter.range === 'all'
      ? state.pricing.message
      : (pricedModelCount > 0
          ? `已计算当前时段内 ${pricedModelCount} 个模型的预估费用`
          : (filteredSessions.length > 0 ? '所选时段会话未包含模型计费数据' : '所选时段内无活跃会话'))
  };

  const summary = {
    ...state.summary,
    totalTokens: tokenBreakdown.totalTokens,
    sessionCount: filteredSessions.length,
    activeSessionCount: activeCount,
    archivedSessionCount: archivedCount,
    messageCount: totalMessages,
  };

  return {
    ...state,
    summary,
    pricing,
    tokenBreakdown,
    dateFilter: filter,
    hasSessions: filteredSessions.length > 0,
    sortedSessions: [...filteredSessions].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1;
      }
      return b.lastModifiedMs - a.lastModifiedMs;
    }),
    analytics: {
      ...state.analytics,
      modelUsage
    }
  };
}
