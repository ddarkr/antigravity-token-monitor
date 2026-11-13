import { describe, it, expect } from 'vitest';
import { deriveDashboardInsights } from './deriveDashboardInsights';
import { mockDashboardState } from '../test/fixtures/dashboardState.fixture';

describe('deriveDashboardInsights', () => {
  it('derives insights correctly and sorts by analytical priority', () => {
    const insights = deriveDashboardInsights(mockDashboardState);
    
    expect(insights.hasSessions).toBe(true);
    expect(insights.sortedSessions.length).toBe(2);
    expect(insights.tokenBreakdown.inputTokens).toBe(300);
    expect(insights.tokenBreakdown.outputTokens).toBe(150);
    expect(insights.tokenBreakdown.cacheReadTokens).toBe(60);
    expect(insights.tokenBreakdown.cacheWriteTokens).toBe(30);
    expect(insights.tokenBreakdown.reasoningTokens).toBe(60);
    expect(insights.tokenBreakdown.totalTokens).toBe(600);
    expect(insights.sortedSessions[0].sessionId).toBe('session-1');
    expect(insights.sortedSessions[1].sessionId).toBe('session-2');
  });

  it('handles empty sessions', () => {
    const emptyState = { ...mockDashboardState, sessions: [] };
    const insights = deriveDashboardInsights(emptyState);
    
    expect(insights.hasSessions).toBe(false);
    expect(insights.sortedSessions.length).toBe(0);
  });

  it('recomputes cache savings and hit rates when filtering by custom date range', () => {
    const insights = deriveDashboardInsights(mockDashboardState, {
      range: 'custom',
      customStart: '2020-09-13',
      customEnd: '2020-09-14'
    });

    const mockModel = insights.analytics.modelUsage.find((m) => m.model === 'mock-model');
    expect(mockModel?.totalTokens).toBe(200);
    expect(mockModel?.cacheHitRate).toBeCloseTo(20 / 120);
    expect(mockModel?.cacheSavedUsd).toBeCloseTo(0.0012 * (200 / 450));
    expect(insights.pricing.totalCacheSavedUsd).toBeCloseTo(0.0012 * (200 / 450));
  });
});
