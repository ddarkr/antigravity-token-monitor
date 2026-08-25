<script lang="ts">
  import type { ActivityHeatmapBin } from '../../../types';
  import { formatCompact, formatUsd } from '../../lib/formatters';

  export let heatmap: ActivityHeatmapBin[];

  const DAYS_TO_SHOW = 30;

  $: recentBins = heatmap.slice(-DAYS_TO_SHOW);
  $: maxTokens = Math.max(...recentBins.map(b => b.totalTokens), 1);

  $: quantiles = (() => {
    const nonZero = recentBins
      .map(b => b.totalTokens || 0)
      .filter(t => t > 0)
      .sort((a, b) => a - b);
    if (nonZero.length === 0) return { q1: 0, q2: 0, q3: 0 };
    if (nonZero.length === 1) return { q1: nonZero[0], q2: nonZero[0], q3: nonZero[0] };
    return {
      q1: nonZero[Math.max(0, Math.floor(nonZero.length * 0.25))],
      q2: nonZero[Math.max(0, Math.floor(nonZero.length * 0.50))],
      q3: nonZero[Math.max(0, Math.floor(nonZero.length * 0.75))]
    };
  })();

  function getLevel(tokens: number): number {
    if (!tokens || tokens <= 0) return 0;
    if (tokens <= quantiles.q1) return 1;
    if (tokens <= quantiles.q2) return 2;
    if (tokens <= quantiles.q3) return 3;
    return 4;
  }

  function formatDateLabel(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }

  let hoveredBin: ActivityHeatmapBin | null = null;
</script>

<section class="mini-heatmap">
  <h3 class="section-label">近 30 天活跃度</h3>

  <div class="heatmap-grid">
    {#each recentBins as bin}
      {@const tokens = bin.totalTokens || 0}
      {@const level = getLevel(tokens)}
      <div
        class="cell lvl-{level}"
        class:cell--empty={tokens === 0}
        title="{formatDateLabel(bin.date)}: {formatCompact(tokens)} Tokens"
        on:mouseenter={() => hoveredBin = bin}
        on:mouseleave={() => hoveredBin = null}
        role="button"
        tabindex="0"
      ></div>
    {/each}
  </div>

  {#if hoveredBin && hoveredBin.totalTokens > 0}
    <div class="heatmap-detail">
      <span class="detail-date">{formatDateLabel(hoveredBin.date)}</span>
      <span class="detail-tokens">{formatCompact(hoveredBin.totalTokens)} Tokens</span>
      {#if hoveredBin.costUsd > 0}
        <span class="detail-cost">{formatUsd(hoveredBin.costUsd)}</span>
      {/if}
      <span class="detail-sessions">{hoveredBin.sessionCount} 个会话</span>
    </div>
  {/if}
</section>

<style>
  .mini-heatmap {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .section-label {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .heatmap-grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 3px;
  }
  .cell {
    aspect-ratio: 1;
    border-radius: 2px;
    border: 1px solid transparent;
    transition: transform 0.15s, border-color 0.15s;
    cursor: default;
    min-width: 0;
  }
  .cell:not(.cell--empty):hover {
    transform: scale(1.35);
    border-color: #ffffff;
    z-index: 5;
    position: relative;
    cursor: pointer;
  }
  .cell.lvl-0 {
    background-color: rgba(255, 255, 255, 0.045);
    border-color: rgba(255, 255, 255, 0.08);
  }
  .cell.lvl-1 {
    background-color: #0d4429;
    border-color: #1b6a3f;
  }
  .cell.lvl-2 {
    background-color: #007a3d;
    border-color: #10b981;
  }
  .cell.lvl-3 {
    background-color: #10b981;
    border-color: #6ee7b7;
  }
  .cell.lvl-4 {
    background-color: #39d353;
    border-color: #a7f3d0;
    box-shadow: 0 0 6px rgba(57, 211, 83, 0.8);
  }
  .heatmap-detail {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    align-items: baseline;
    font-size: 10px;
    color: var(--muted);
    padding: var(--spacing-xs) 0;
    animation: detail-in 120ms ease;
  }
  .detail-date {
    font-weight: 600;
    color: var(--text);
  }
  .detail-tokens {
    font-family: var(--code-font);
    color: #4ade80;
    font-weight: 600;
  }
  .detail-cost {
    font-family: var(--code-font);
  }
  @keyframes detail-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
