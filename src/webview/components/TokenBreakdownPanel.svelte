<script lang="ts">
  import type { TokenBreakdown } from '../../types';
  import { formatNumber } from '../lib/formatters';

  export let breakdown: TokenBreakdown;

  $: cacheTokens = breakdown.cacheReadTokens + breakdown.cacheWriteTokens;
  $: categorizedTotal = breakdown.inputTokens + breakdown.outputTokens + cacheTokens + breakdown.reasoningTokens;
  $: total = Math.max(categorizedTotal, 1);

  $: items = [
    { key: 'input', label: 'Input', tokens: breakdown.inputTokens, pct: (breakdown.inputTokens / total) * 100 },
    { key: 'output', label: 'Output', tokens: breakdown.outputTokens, pct: (breakdown.outputTokens / total) * 100 },
    { key: 'cache', label: 'Cache', tokens: cacheTokens, pct: (cacheTokens / total) * 100 },
    { key: 'reasoning', label: 'Reasoning', tokens: breakdown.reasoningTokens, pct: (breakdown.reasoningTokens / total) * 100 }
  ];

  const formatPct = (pct: number) => pct < 0.1 && pct > 0 ? '<0.1%' : `${pct.toFixed(1)}%`;
</script>

<article class="analytical-card">
  <div class="card-header">
    <h2 class="section-title">Token Breakdown</h2>
    <div class="card-meta">Proportional shares</div>
  </div>

  <div class="card-body">
    <div class="total-display">
      <span class="total-number">{formatNumber(breakdown.totalTokens)}</span>
      <span class="total-label">Total Tokens</span>
    </div>

    <div class="coverage-copy">
      <span>{formatNumber(categorizedTotal)} categorized</span>
      {#if breakdown.totalTokens !== categorizedTotal}
        <span>• {formatPct(categorizedTotal / Math.max(breakdown.totalTokens, 1) * 100)} of total classified</span>
      {/if}
    </div>

    <div class="stacked-bar">
      {#each items as item}
        {#if item.tokens > 0}
          <div class="segment {item.key}" style="width: {item.pct}%" title="{item.label}: {formatNumber(item.tokens)}"></div>
        {/if}
      {/each}
    </div>

    <div class="legend">
      {#each items as item}
        <div class="legend-item">
          <div class="legend-color {item.key}"></div>
          <div class="legend-info">
            <span class="legend-label">{item.label}</span>
            <span class="legend-value">{formatNumber(item.tokens)} <span class="legend-pct">({formatPct(item.pct)})</span></span>
          </div>
        </div>
      {/each}
    </div>
  </div>
</article>

<style>
  .analytical-card {
    background: var(--canvas-bg);
    display: flex;
    flex-direction: column;
  }
  .card-header {
    padding: 0 0 var(--spacing-md) 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .section-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--font-display);
    letter-spacing: -0.01em;
  }
  .card-meta {
    font-size: 12px;
    color: var(--muted);
  }
  .card-body {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    box-shadow: var(--shadow-elevated);
  }
  .total-display {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .total-number {
    font-size: 32px;
    font-weight: 300;
    color: var(--text);
    line-height: 1;
    font-family: var(--code-font);
    letter-spacing: -0.02em;
  }
  .total-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    margin-top: var(--spacing-xs);
  }
  .coverage-copy {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
    color: var(--muted);
    font-size: 12px;
  }
  .stacked-bar {
    display: flex;
    height: 32px;
    border-radius: 16px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);
    width: 100%;
    box-shadow: inset 0 0 0 1px var(--surface-line);
  }
  .segment {
    height: 100%;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .segment:not(:last-child) {
    border-right: 2px solid var(--panel);
  }
  .input { background: var(--accent); }
  .output { background: var(--accent-strong); }
  .reasoning { background: var(--warm); }
  .cache { background: #73b8ff; }

  .legend {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--spacing-md);
  }
  .legend-item {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: rgba(255, 255, 255, 0.02);
    border-radius: 8px;
    border: 1px solid var(--surface-line);
  }
  .legend-color {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    margin-top: 2px;
    flex-shrink: 0;
  }
  .legend-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .legend-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .legend-value {
    font-size: 14px;
    font-weight: 400;
    color: var(--text);
    font-family: var(--code-font);
  }
  .legend-pct {
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
    margin-left: 4px;
  }
</style>
