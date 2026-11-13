<script lang="ts">
  import type { DashboardState } from '../../types';
  import { formatNumber, formatPercent, formatUsd } from '../lib/formatters';
  import HeaderBar from './HeaderBar.svelte';

  export let state: DashboardState;
  $: summary = state.summary;
  $: pricing = state.pricing;
  $: totalInputAndCache = state.sessions.reduce(
    (sum, s) => sum + (s.latest.inputTokens || 0) + (s.latest.cacheReadTokens || 0),
    0
  );
  $: totalCacheRead = state.sessions.reduce((sum, s) => sum + (s.latest.cacheReadTokens || 0), 0);
  $: cacheHitRate = totalInputAndCache > 0 ? totalCacheRead / totalInputAndCache : undefined;
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
      <div class="stat-context">
        {#if pricing.totalCacheSavedUsd !== undefined && pricing.totalCacheSavedUsd > 0}
          缓存节省 {formatUsd(pricing.totalCacheSavedUsd)}
          {#if cacheHitRate !== undefined}
            • 命中率 {formatPercent(cacheHitRate)}
          {/if}
        {:else if cacheHitRate !== undefined}
          缓存命中率 {formatPercent(cacheHitRate)} • {pricing.message}
        {:else}
          {pricing.message}
        {/if}
      </div>
    </article>
  </div>
</section>

<style>
  .stat-band {
    background: var(--hero-bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--spacing-md) var(--spacing-lg);
    box-shadow: var(--shadow-elevated);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
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
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--line);
    padding-bottom: 14px;
    gap: 10px var(--spacing-md);
  }
  .stat-header-container {
    flex: 0 1 auto;
    max-width: 100%;
  }
  .stat-sub-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px var(--spacing-md);
  }
  .stat-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .stat-block.primary {
    flex: 1 1 160px;
    min-width: min(100%, 160px);
    gap: 2px;
  }
  .stat-label {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-family: var(--font-display);
  }
  .stat-value {
    font-size: clamp(20px, 2.2vw, 24px);
    font-weight: 300;
    line-height: 1.1;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    font-family: var(--code-font);
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .stat-block.primary .stat-value {
    font-size: clamp(24px, 3vw, 34px);
    line-height: 1.08;
  }
  .stat-value.highlight {
    color: var(--accent);
    font-weight: 500;
  }
  .stat-context {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.35;
  }
  @media (max-width: 640px) {
    .stat-band {
      padding: 14px var(--spacing-md);
      gap: 12px;
    }
  }
  @media (max-width: 520px) {
    .stat-hero-row {
      align-items: flex-start;
    }
    .stat-header-container {
      width: 100%;
    }
    .stat-sub-grid {
      grid-template-columns: 1fr;
      gap: var(--spacing-sm);
    }
  }
</style>
