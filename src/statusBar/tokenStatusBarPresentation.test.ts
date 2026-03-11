import { describe, expect, it } from 'vitest';
import { mockDashboardState } from '../webview/test/fixtures/dashboardState.fixture';
import { buildTokenStatusBarPresentation } from './tokenStatusBarPresentation';

describe('buildTokenStatusBarPresentation', () => {
  it('shows total tokens in idle state', () => {
    const presentation = buildTokenStatusBarPresentation(mockDashboardState);

    expect(presentation).toEqual({
      text: '$(graph) 600 tokens 🔥',
      tooltip: [
        'Total tokens: 600',
        'Sessions: 2 sessions',
        'Recent activity: 1 changed session',
        'Sync: Synced',
        'Click to open dashboard'
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

    expect(presentation.text).toBe('$(sync~spin) 600 tokens 🔥');
    expect(presentation.tooltip).toContain('Sync: Refreshing token data...');
    expect(presentation.isError).toBe(false);
  });

  it('marks error state for failed syncs', () => {
    const presentation = buildTokenStatusBarPresentation({
      ...mockDashboardState,
      syncStatus: 'error',
      syncMessage: 'Session scan did not complete.'
    });

    expect(presentation.text).toBe('$(warning) 600 tokens 🔥');
    expect(presentation.tooltip).toContain('Sync: Session scan did not complete.');
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

    expect(presentation.text).toBe('$(graph) 1.2m tokens 🔥');
    expect(presentation.tooltip).toContain('Total tokens: 1,234,567');
    expect(presentation.tooltip).toContain('Sessions: 1 session');
    expect(presentation.tooltip).toContain('Recent activity: 0 changed sessions');
  });
});
