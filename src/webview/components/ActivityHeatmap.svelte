<script lang="ts">
  import type { ActivityHeatmapBin } from '../../types';
  import { formatNumber, formatCompact, formatUsd } from '../lib/formatters';
  import { tick } from 'svelte';

  export let heatmap: ActivityHeatmapBin[];

  let containerRef: HTMLElement;

  // Popover state
  let hoveredBin: (ActivityHeatmapBin & { isEmpty?: boolean }) | null = null;
  let popoverX = 0;
  let popoverY = 0;
  let popoverVisible = false;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleCellEnter(e: MouseEvent, bin: ActivityHeatmapBin & { isEmpty?: boolean }) {
    if (bin.isEmpty || bin.totalTokens === 0) {
      return;
    }
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    hoveredBin = bin;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    // Position popover relative to the viewport
    popoverX = rect.left + rect.width / 2;
    popoverY = rect.top;
    popoverVisible = true;
  }

  function handleCellLeave() {
    hideTimeout = setTimeout(() => {
      popoverVisible = false;
      hoveredBin = null;
    }, 150);
  }

  function formatDateLabel(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  $: maxTokens = Math.max(...heatmap.map(b => b.totalTokens), 1);

  function getIntensity(tokens: number): number {
    if (tokens === 0) return 0;
    return Math.max(0.2, Math.min(1, Math.log(tokens + 1) / Math.log(maxTokens + 1)));
  }

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  $: paddedHeatmap = (() => {
    if (!heatmap.length) return [];
    
    const [y, m, d] = heatmap[0].date.split('-').map(Number);
    const firstDate = new Date(y, m - 1, d);
    const firstDayOfWeek = firstDate.getDay();
    
    const padding = Array(firstDayOfWeek).fill({
      date: '',
      totalTokens: 0,
      sessionCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      costUsd: 0,
      messageCount: 0,
      isEmpty: true
    });
    
    return [...padding, ...heatmap.map(b => ({ ...b, isEmpty: false }))];
  })();

  $: columnsCount = Math.ceil(paddedHeatmap.length / 7);

  $: monthLabels = (() => {
    if (paddedHeatmap.length === 0) return [];

    const labels: { name: string; span: number }[] = [];
    let currentMonth = -1;
    let span = 0;
    
    for (let w = 0; w < columnsCount; w++) {
       let weekStartDate: Date | null = null;
       for (let d = 0; d < 7; d++) {
         const bin = paddedHeatmap[w * 7 + d];
         if (bin && !bin.isEmpty) {
           const [yr, mo, da] = bin.date.split('-').map(Number);
           weekStartDate = new Date(yr, mo - 1, da);
           break;
         }
       }
       if (weekStartDate) {
         const m = weekStartDate.getMonth();
         if (m !== currentMonth) {
           if (currentMonth !== -1) {
             labels[labels.length - 1].span = span;
           }
           // avoid duplicate adjacent month labels or very short spans at boundaries
           labels.push({ name: weekStartDate.toLocaleString('en-US', { month: 'short' }), span: 1 });
           currentMonth = m;
           span = 1;
         } else {
           span++;
         }
       } else {
         span++;
       }
    }
    if (labels.length > 0) {
      labels[labels.length - 1].span = span;
    }
    return labels;
  })();

  $: if (containerRef && heatmap.length) {
    tick().then(() => {
      setTimeout(() => {
        if (containerRef) {
          containerRef.scrollLeft = containerRef.scrollWidth;
        }
      }, 50);
    });
  }
</script>

<article class="analytical-card">
  <div class="card-header">
    <h2 class="section-title">Token Retention Heatmap</h2>
    <div class="card-meta">Current tokens distributed by last modified date</div>
  </div>

  <div class="heatmap-container" bind:this={containerRef}>
    <div class="calendar-container">
      <div class="months-header" style="grid-template-columns: repeat({columnsCount}, 12px);">
        {#each monthLabels as label}
           <div class="month-label" style="grid-column: span {label.span};">{label.name}</div>
        {/each}
      </div>

      <div class="calendar-body">
        <div class="days-column">
          {#each dayLabels as day, i}
             <div class="day-label">{i % 2 !== 0 ? day : ''}</div>
          {/each}
        </div>

        <div class="heatmap-grid" style="grid-template-rows: repeat(7, 12px);">
           {#each paddedHeatmap as bin}
              {#if bin.isEmpty}
                <div class="cell-empty"></div>
              {:else}
                {@const tokens = bin.totalTokens || 0}
                {@const intensity = getIntensity(tokens)}
                <div
                  role="button"
                  tabindex="0"
                  class="heatmap-cell"
                  style="background-color: {tokens > 0 ? `rgba(42, 157, 244, ${intensity})` : 'var(--bg-elevated)'}; border-color: {tokens > 0 ? `rgba(42, 157, 244, ${Math.max(0.2, intensity)})` : 'var(--line)'}"
                  on:mouseenter={(e) => handleCellEnter(e, bin)}
                  on:mouseleave={handleCellLeave}
                ></div>
              {/if}
           {/each}
        </div>
      </div>
    </div>

    {#if popoverVisible && hoveredBin}
      <div
        role="tooltip"
        class="heatmap-popover"
        style="left: {popoverX}px; top: {popoverY}px;"
        on:mouseenter={() => { if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; } }}
        on:mouseleave={handleCellLeave}
      >
        <div class="popover-date">{formatDateLabel(hoveredBin.date)}</div>
        <div class="popover-divider"></div>

        <div class="popover-row popover-row--highlight">
          <span class="popover-label">Tokens Processed</span>
          <span class="popover-value popover-value--accent">{formatCompact(hoveredBin.totalTokens)}</span>
        </div>

        <div class="popover-divider"></div>

        <div class="popover-row">
          <span class="popover-label">Input</span>
          <span class="popover-value">{formatCompact(hoveredBin.inputTokens)}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">Output</span>
          <span class="popover-value">{formatCompact(hoveredBin.outputTokens)}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">Cache Read</span>
          <span class="popover-value">{formatCompact(hoveredBin.cacheReadTokens)}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">Cache Write</span>
          <span class="popover-value">{formatCompact(hoveredBin.cacheWriteTokens)}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">Reasoning</span>
          <span class="popover-value">{formatCompact(hoveredBin.reasoningTokens)}</span>
        </div>

        <div class="popover-divider"></div>

        <div class="popover-row">
          <span class="popover-label">Cost</span>
          <span class="popover-value">{hoveredBin.costUsd > 0 ? formatUsd(hoveredBin.costUsd) : '—'}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">Messages</span>
          <span class="popover-value">{hoveredBin.messageCount}</span>
        </div>
      </div>
    {/if}
  </div>
</article>

<style>
  .analytical-card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: var(--shadow-elevated);
  }
  .card-header {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--line);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.01);
  }
  .section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .card-meta {
    font-size: 11px;
    color: var(--muted);
  }
  .heatmap-container {
    padding: var(--spacing-md);
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
    text-align: center;
    position: relative;
  }
  .heatmap-container::-webkit-scrollbar {
    height: 8px;
  }
  .heatmap-container::-webkit-scrollbar-thumb {
    background-color: var(--line);
    border-radius: 4px;
    border: 2px solid var(--panel);
  }
  .calendar-container {
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
    min-width: max-content;
    text-align: left;
  }
  .months-header {
    padding-left: 28px; /* sync with .days-column width + gap */
    display: grid;
    gap: 3px;
    height: 14px;
  }
  .month-label {
    font-size: 10px;
    color: var(--muted);
    line-height: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .calendar-body {
    display: flex;
    gap: 4px;
  }
  .days-column {
    display: grid;
    grid-template-rows: repeat(7, 12px);
    gap: 3px;
    width: 24px;
    text-align: right;
  }
  .day-label {
    font-size: 9px;
    line-height: 12px;
    color: var(--muted);
  }
  .heatmap-grid {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 12px;
    gap: 3px;
  }
  .cell-empty {
    width: 12px;
    height: 12px;
  }
  .heatmap-cell {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid transparent; /* default transparent to avoid flicker */
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s;
    cursor: pointer;
  }
  .heatmap-cell:hover {
    transform: scale(1.35);
    z-index: 10;
    position: relative;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    border-color: var(--accent-strong) !important;
  }

  /* Popover styles */
  .heatmap-popover {
    position: fixed;
    z-index: 10000;
    transform: translate(-50%, calc(-100% - 10px));
    min-width: 220px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3);
    padding: 14px 16px;
    pointer-events: auto;
    animation: popover-in 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes popover-in {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-100% - 6px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, calc(-100% - 10px)) scale(1);
    }
  }

  .popover-date {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 2px;
  }

  .popover-divider {
    height: 1px;
    background: var(--line);
    margin: 10px 0;
  }

  .popover-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
  }

  .popover-row--highlight {
    padding: 4px 0;
  }

  .popover-label {
    font-size: 12px;
    color: var(--muted);
  }

  .popover-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .popover-value--accent {
    font-size: 18px;
    font-weight: 700;
    color: var(--accent-strong, #2a9df4);
  }
</style>
