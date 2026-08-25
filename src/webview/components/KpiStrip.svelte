<script lang="ts">
  import type { DashboardState } from '../../types';
  import { formatNumber, formatUsd } from '../lib/formatters';
  import HeaderBar from './HeaderBar.svelte';

  export let state: DashboardState;
  $: summary = state.summary;
  $: pricing = state.pricing;
</script>

<section class="stat-band">
  <div class="stat-hero-row">
    <article class="stat-block primary">
      <div class="stat-label">总 Token 消耗</div>
      <div class="stat-value highlight">{formatNumber(summary.totalTokens)}</div>
      <div class="stat-context">所有已分析会话的总消耗量</div>
    </article>

    <div class="stat-header-container">
      <HeaderBar {state} />
    </div>
  </div>

  <div class="stat-sub-grid">
    <article class="stat-block">
      <div class="stat-label">会话总数</div>
      <div class="stat-value">{formatNumber(summary.sessionCount)}</div>
      <div class="stat-context">{formatNumber(summary.activeSessionCount)} 个活跃, {formatNumber(summary.archivedSessionCount)} 个已归档</div>
    </article>

    <article class="stat-block">
      <div class="stat-label">消息总数</div>
      <div class="stat-value">{formatNumber(summary.messageCount)}</div>
      <div class="stat-context">各会话累计处理的消息总数</div>
    </article>

    <article class="stat-block">
      <div class="stat-label">预估总费用</div>
      <div class="stat-value">{pricing.pricedModelCount > 0 ? formatUsd(pricing.totalCostUsd) : '暂无报价'}</div>
      <div class="stat-context">{pricing.message}</div>
    </article>
  </div>
</section>

<style>
  .stat-band {
    background: var(--hero-bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--spacing-xl) var(--spacing-xl);
    box-shadow: var(--shadow-elevated);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }
  .stat-band::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    opacity: 0.5;
  }
  .stat-hero-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--line);
    padding-bottom: var(--spacing-lg);
    gap: var(--spacing-lg);
  }
  .stat-header-container {
    flex-shrink: 0;
  }
  .stat-sub-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-xl);
  }
  .stat-block {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  .stat-block.primary {
    flex: 1;
    gap: var(--spacing-sm);
  }
  .stat-label {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-family: var(--font-display);
  }
  .stat-value {
    font-size: 24px;
    font-weight: 300;
    line-height: 1.1;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    font-family: var(--code-font);
    letter-spacing: -0.02em;
  }
  .stat-block.primary .stat-value {
    font-size: 36px;
  }
  .stat-value.highlight {
    color: var(--accent-strong);
    font-weight: 400;
    text-shadow: 0 0 24px rgba(199, 242, 150, 0.2);
  }
  .stat-context {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.4;
  }
  @media (max-width: 900px) {
    .stat-hero-row {
      flex-direction: column;
      align-items: flex-start;
    }
    .stat-sub-grid {
      grid-template-columns: 1fr;
      gap: var(--spacing-md);
    }
  }
</style>
