<script lang="ts">
  import type { DashboardState } from '../../../types';
  import { formatCompact, formatUsd } from '../../lib/formatters';

  export let summary: DashboardState['summary'];
  export let pricing: DashboardState['pricing'];
</script>

<section class="kpi-section">
  <div class="kpi-card primary">
    <div class="kpi-value highlight">{formatCompact(summary.totalTokens)}</div>
    <div class="kpi-label">Token 总数</div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-value">{summary.activeSessionCount}</div>
      <div class="kpi-label">活跃会话</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{summary.messageCount}</div>
      <div class="kpi-label">消息数</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{pricing.pricedModelCount > 0 ? formatUsd(pricing.totalCostUsd) : '—'}</div>
      <div class="kpi-label">预估费用</div>
    </div>
  </div>

  <div class="kpi-meta">
    共 {summary.sessionCount} 个会话 ({summary.archivedSessionCount} 个已归档)
    {#if summary.estimatedSessionCount > 0}
      • {summary.estimatedSessionCount} 个估算
    {/if}
  </div>
</section>

<style>
  .kpi-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .kpi-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--spacing-sm) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  .kpi-card.primary {
    background: linear-gradient(135deg, rgba(136, 216, 176, 0.06), rgba(199, 242, 150, 0.04));
    border-color: rgba(136, 216, 176, 0.2);
    padding: var(--spacing-md);
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .kpi-card.primary::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    opacity: 0.5;
  }
  .kpi-value {
    font-size: 16px;
    font-weight: 400;
    color: var(--text);
    font-family: var(--code-font);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }
  .kpi-value.highlight {
    font-size: 28px;
    font-weight: 400;
    color: var(--accent-strong);
    text-shadow: 0 0 20px rgba(199, 242, 150, 0.15);
  }
  .kpi-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .kpi-row {
    display: flex;
    gap: var(--spacing-sm);
  }
  .kpi-meta {
    font-size: 10px;
    color: var(--muted);
    text-align: center;
    padding: 0 var(--spacing-xs);
  }
</style>
