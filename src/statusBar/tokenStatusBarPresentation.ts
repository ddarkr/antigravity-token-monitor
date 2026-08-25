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
  const tooltipLines = [
    `Token 总计: ${totalTokensFull}`,
    `会话总数: ${formatNumber(state.summary.sessionCount)} 个会话`,
    `最近变动: ${formatNumber(state.summary.changedSessionCount)} 个活跃会话`,
    `同步状态: ${state.syncMessage || state.exportStatus.message || '空闲'}`,
    '点击打开完整仪表盘'
  ];

  return {
    text: `${icon} ${totalTokensCompact} Tokens 🔥`,
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
