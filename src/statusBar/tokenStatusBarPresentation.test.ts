import { describe, expect, it } from 'vitest';
import { mockDashboardState } from '../webview/test/fixtures/dashboardState.fixture';
import { buildTokenStatusBarPresentation } from './tokenStatusBarPresentation';

describe('buildTokenStatusBarPresentation', () => {
  it('shows total tokens in idle state', () => {
    const presentation = buildTokenStatusBarPresentation(mockDashboardState);

    expect(presentation).toEqual({
      text: '$(graph) 600 Tokens 🔥',
      tooltip: [
        'Token 总计: 600',
        '会话总数: 2 个会话',
        '最近变动: 1 个活跃会话',
        '同步状态: Synced',
        '点击打开完整仪表盘'
      ].join('\n'),
      isError: false
    });
  });

  it('shows a spinner while refresh is running', () => {
    const presentation = buildTokenStatusBarPresentation({
      ...mockDashboardState,
      syncStatus: 'running',
      syncMessage: 'Refreshing token data...'
    });

    expect(presentation.text).toBe('$(sync~spin) 600 Tokens 🔥');
    expect(presentation.tooltip).toContain('同步状态: Refreshing token data...');
    expect(presentation.isError).toBe(false);
  });

  it('marks error state for failed syncs', () => {
    const presentation = buildTokenStatusBarPresentation({
      ...mockDashboardState,
      syncStatus: 'error',
      syncMessage: 'Session scan did not complete.'
    });

    expect(presentation.text).toBe('$(warning) 600 Tokens 🔥');
    expect(presentation.tooltip).toContain('同步状态: Session scan did not complete.');
    expect(presentation.isError).toBe(true);
  });

  it('formats large token totals with separators', () => {
    const presentation = buildTokenStatusBarPresentation({
      ...mockDashboardState,
      summary: {
        ...mockDashboardState.summary,
        totalTokens: 1234567,
        sessionCount: 1,
        changedSessionCount: 0
      }
    });

    expect(presentation.text).toBe('$(graph) 1.2m Tokens 🔥');
    expect(presentation.tooltip).toContain('Token 总计: 1,234,567');
    expect(presentation.tooltip).toContain('会话总数: 1 个会话');
    expect(presentation.tooltip).toContain('最近变动: 0 个活跃会话');
  });
});
