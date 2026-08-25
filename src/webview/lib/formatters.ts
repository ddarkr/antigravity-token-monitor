import type { DashboardState } from '../../types';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatCompact(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

export function formatUsd(value: number): string {
  if (value >= 1) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }

  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) {
    return `${seconds}秒前`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}分钟前`;
  }
  if (seconds < 86400) {
    return `${Math.round(seconds / 3600)}小时前`;
  }
  return `${Math.round(seconds / 86400)}天前`;
}

export function formatSource(source: DashboardState['sessions'][number]['source']): string {
  return source === 'rpc-artifact' ? 'RPC 产物' : '文件系统';
}

export function formatExportStatus(status: DashboardState['exportStatus']['status']): string {
  if (status === 'running') {
    return '导出中';
  }
  if (status === 'error') {
    return '异常';
  }
  return '空闲';
}
