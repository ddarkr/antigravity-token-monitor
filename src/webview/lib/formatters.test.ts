import { describe, it, expect } from 'vitest';
import { formatNumber, formatRelative, formatSource, formatExportStatus, formatUsd } from './formatters';

describe('formatters', () => {
  it('formats numbers correctly', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
    expect(formatUsd(12.5)).toBe('$12.50');
    expect(formatUsd(0.0041)).toBe('$0.0041');
  });

  it('formats relative time correctly', () => {
    const now = Date.now();
    expect(formatRelative(now - 10000)).toBe('10秒前');
    expect(formatRelative(now - 120000)).toBe('2分钟前');
    expect(formatRelative(now - 7200000)).toBe('2小时前');
    expect(formatRelative(now - 172800000)).toBe('2天前');
  });

  it('formats source correctly', () => {
    expect(formatSource('rpc-artifact')).toBe('RPC 产物');
    expect(formatSource('filesystem')).toBe('文件系统');
  });

  it('formats export status correctly', () => {
    expect(formatExportStatus('running')).toBe('导出中');
    expect(formatExportStatus('error')).toBe('异常');
    expect(formatExportStatus('idle')).toBe('空闲');
  });
});
