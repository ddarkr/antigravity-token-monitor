import { PersistedSessionState, SessionSnapshot, SessionTotals, TokenBreakdown } from '../types';

export class SessionUsageCalculator {
  calculate(previous: PersistedSessionState | undefined, next: SessionTotals, capturedAt: number): SessionSnapshot {
    if (!previous) {
      return createSnapshot(next, capturedAt, next);
    }

    const latest = previous.latest;
    return createSnapshot(next, capturedAt, {
      inputTokens: diffOrReset(latest.inputTokens, next.inputTokens),
      outputTokens: diffOrReset(latest.outputTokens, next.outputTokens),
      cacheReadTokens: diffOrReset(latest.cacheReadTokens, next.cacheReadTokens),
      cacheWriteTokens: diffOrReset(latest.cacheWriteTokens, next.cacheWriteTokens),
      reasoningTokens: diffOrReset(latest.reasoningTokens, next.reasoningTokens),
      totalTokens: diffOrReset(latest.totalTokens, next.totalTokens)
    });
  }
}

function createSnapshot(next: SessionTotals, capturedAt: number, delta: TokenBreakdown): SessionSnapshot {
  return {
    capturedAt,
    mode: next.mode,
    inputTokens: delta.inputTokens,
    outputTokens: delta.outputTokens,
    cacheReadTokens: delta.cacheReadTokens,
    cacheWriteTokens: delta.cacheWriteTokens,
    reasoningTokens: delta.reasoningTokens,
    totalTokens: delta.totalTokens
  };
}

function diffOrReset(previous: number, next: number): number {
  if (next < previous) {
    return next;
  }

  return next - previous;
}
