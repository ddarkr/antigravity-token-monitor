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
    expect(formatRelative(now - 10000)).toBe('10s ago');
    expect(formatRelative(now - 120000)).toBe('2m ago');
    expect(formatRelative(now - 7200000)).toBe('2h ago');
    expect(formatRelative(now - 172800000)).toBe('2d ago');
  });

  it('formats source correctly', () => {
    expect(formatSource('rpc-artifact')).toBe('RPC artifact');
    expect(formatSource('filesystem')).toBe('Filesystem');
  });

  it('formats export status correctly', () => {
    expect(formatExportStatus('running')).toBe('Running');
    expect(formatExportStatus('error')).toBe('Error');
    expect(formatExportStatus('idle')).toBe('Idle');
  });
});
