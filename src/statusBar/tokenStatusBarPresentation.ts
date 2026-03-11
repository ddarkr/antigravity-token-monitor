import type { DashboardState } from '../types';

export type TokenStatusBarPresentation = {
  text: string;
  tooltip: string;
  isError: boolean;
};

export function buildTokenStatusBarPresentation(state: DashboardState): TokenStatusBarPresentation {
  const isRunning = state.syncStatus === 'running' || state.exportStatus.status === 'running';
  const isError = state.syncStatus === 'error' || state.exportStatus.status === 'error';
  const icon = isRunning
    ? '$(sync~spin)'
    : isError
      ? '$(warning)'
      : '$(graph)';
  const totalTokensCompact = formatNumberCompact(state.summary.totalTokens);
  const totalTokensFull = formatNumber(state.summary.totalTokens);
  const sessionLabel = state.summary.sessionCount === 1 ? 'session' : 'sessions';
  const changedLabel = state.summary.changedSessionCount === 1 ? 'changed session' : 'changed sessions';
  const tooltipLines = [
    `Total tokens: ${totalTokensFull}`,
    `Sessions: ${formatNumber(state.summary.sessionCount)} ${sessionLabel}`,
    `Recent activity: ${formatNumber(state.summary.changedSessionCount)} ${changedLabel}`,
    `Sync: ${state.syncMessage || state.exportStatus.message || 'Idle.'}`,
    'Click to open dashboard'
  ];

  return {
    text: `${icon} ${totalTokensCompact} tokens 🔥`,
    tooltip: tooltipLines.join('\n'),
    isError
  };
}

function formatNumberCompact(value: number): string {
  if (value >= 1_000_000_000) {
    const v = value / 1_000_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}b`;
  }
  if (value >= 1_000_000) {
    const v = value / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}m`;
  }
  if (value >= 1_000) {
    const v = value / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  return value.toString();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
