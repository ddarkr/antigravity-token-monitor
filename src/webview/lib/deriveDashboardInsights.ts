import type { DashboardState, TokenBreakdown } from '../../types';

type DerivedDashboardInsights = DashboardState & {
  tokenBreakdown: TokenBreakdown;
  hasSessions: boolean;
  sortedSessions: DashboardState['sessions'];
};

export function deriveDashboardInsights(state: DashboardState): DerivedDashboardInsights {
  const tokenBreakdown: TokenBreakdown = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };

  for (const session of state.sessions) {
    tokenBreakdown.inputTokens += session.latest.inputTokens || 0;
    tokenBreakdown.outputTokens += session.latest.outputTokens || 0;
    tokenBreakdown.cacheReadTokens += session.latest.cacheReadTokens || 0;
    tokenBreakdown.cacheWriteTokens += session.latest.cacheWriteTokens || 0;
    tokenBreakdown.reasoningTokens += session.latest.reasoningTokens || 0;
    tokenBreakdown.totalTokens += session.latest.totalTokens || 0;
  }

  // In phase 1, we just pass through the state, but this is where we would
  // compute derived metrics like top models, cost estimates, etc.
  return {
    ...state,
    tokenBreakdown,
    hasSessions: state.sessions.length > 0,
    sortedSessions: [...state.sessions].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1;
      }

      return b.lastModifiedMs - a.lastModifiedMs;
    })
  };
}
