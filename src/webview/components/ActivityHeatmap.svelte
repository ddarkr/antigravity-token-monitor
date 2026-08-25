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
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  }

  $: maxTokens = Math.max(...heatmap.map(b => b.totalTokens), 1);
  $: activeDaysCount = heatmap.filter(b => b.totalTokens > 0).length;

  // Compute 4-tier quantile distribution so different days are distinctly separated
  $: quantiles = (() => {
    const nonZero = heatmap
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

  function getLevelName(level: number): string {
    if (level === 1) return '轻度使用 (Lv.1)';
    if (level === 2) return '中度使用 (Lv.2)';
    if (level === 3) return '高频活跃 (Lv.3)';
    if (level === 4) return '峰值消耗 (Lv.4)';
    return '无活动';
  }

  const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const monthNamesCn = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

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
           labels.push({ name: monthNamesCn[m], span: 1 });
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
    <div class="header-left">
      <h2 class="section-title">Token 活跃热力图</h2>
      <span class="active-badge">近 180 天活跃 {activeDaysCount} 天</span>
    </div>
    <div class="card-meta">最近活跃峰值: <strong class="highlight-text">{formatCompact(maxTokens)} Tokens</strong></div>
  </div>

  <div class="heatmap-container" bind:this={containerRef}>
    <div class="calendar-container">
      <div class="months-header" style="grid-template-columns: repeat({columnsCount}, 15px);">
        {#each monthLabels as label}
           <div class="month-label" style="grid-column: span {label.span};">{label.name}</div>
        {/each}
      </div>

      <div class="calendar-body">
        <div class="days-column">
          {#each dayLabels as day, i}
             <div class="day-label">{i === 1 ? '一' : i === 3 ? '三' : i === 5 ? '五' : ''}</div>
          {/each}
        </div>

        <div class="heatmap-grid" style="grid-template-rows: repeat(7, 15px); grid-auto-columns: 15px;">
           {#each paddedHeatmap as bin}
              {#if bin.isEmpty}
                <div class="cell-empty"></div>
              {:else}
                {@const tokens = bin.totalTokens || 0}
                {@const level = getLevel(tokens)}
                <div
                  role="button"
                  tabindex="0"
                  class="heatmap-cell lvl-{level}"
                  title="{bin.date}: {tokens > 0 ? formatNumber(tokens) + ' Tokens (' + getLevelName(level) + ')' : '无活跃记录'}"
                  on:mouseenter={(e) => handleCellEnter(e, bin)}
                  on:mouseleave={handleCellLeave}
                ></div>
              {/if}
           {/each}
        </div>
      </div>

      <!-- Bottom legend strip -->
      <div class="heatmap-footer">
        <span class="footer-hint">鼠标悬停方块查看当日 Token 消耗明细</span>
        <div class="legend-scale">
          <span class="scale-text">少</span>
          <div class="scale-cell lvl-0" title="无消耗 (0)"></div>
          <div class="scale-cell lvl-1" title="轻度活跃 (1 ~ {formatCompact(quantiles.q1)})"></div>
          <div class="scale-cell lvl-2" title="中度活跃 ({formatCompact(quantiles.q1)} ~ {formatCompact(quantiles.q2)})"></div>
          <div class="scale-cell lvl-3" title="高频活跃 ({formatCompact(quantiles.q2)} ~ {formatCompact(quantiles.q3)})"></div>
          <div class="scale-cell lvl-4" title="峰值消耗 (>{formatCompact(quantiles.q3)})"></div>
          <span class="scale-text">多</span>
        </div>
      </div>
    </div>

    {#if popoverVisible && hoveredBin}
      {@const tokens = hoveredBin.totalTokens || 0}
      {@const level = getLevel(tokens)}
      <div
        role="tooltip"
        class="heatmap-popover"
        style="left: {popoverX}px; top: {popoverY}px;"
        on:mouseenter={() => { if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; } }}
        on:mouseleave={handleCellLeave}
      >
        <div class="popover-top">
          <div class="popover-date">{formatDateLabel(hoveredBin.date)}</div>
          <span class="popover-badge lvl-{level}">{getLevelName(level)}</span>
        </div>
        <div class="popover-divider"></div>

        <div class="popover-row popover-row--highlight">
          <span class="popover-label">处理 Token 总量</span>
          <span class="popover-value popover-value--accent">{formatNumber(hoveredBin.totalTokens)}</span>
        </div>

        <div class="popover-divider"></div>

        <div class="popover-row">
          <span class="popover-label">输入 (Input)</span>
          <span class="popover-value">{formatCompact(hoveredBin.inputTokens)}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">输出 (Output)</span>
          <span class="popover-value">{formatCompact(hoveredBin.outputTokens)}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">缓存读取 (Cache Read)</span>
          <span class="popover-value">{formatCompact(hoveredBin.cacheReadTokens)}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">缓存写入 (Cache Write)</span>
          <span class="popover-value">{formatCompact(hoveredBin.cacheWriteTokens)}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">思考推理 (Reasoning)</span>
          <span class="popover-value">{formatCompact(hoveredBin.reasoningTokens)}</span>
        </div>

        <div class="popover-divider"></div>

        <div class="popover-row">
          <span class="popover-label">预估费用</span>
          <span class="popover-value">{hoveredBin.costUsd > 0 ? formatUsd(hoveredBin.costUsd) : '—'}</span>
        </div>
        <div class="popover-row">
          <span class="popover-label">会话消息数</span>
          <span class="popover-value">{hoveredBin.messageCount} 条</span>
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
  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
  .section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .active-badge {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(57, 211, 83, 0.12);
    color: #4ade80;
    border: 1px solid rgba(57, 211, 83, 0.28);
    font-weight: 600;
  }
  .card-meta {
    font-size: 11px;
    color: var(--muted);
  }
  .highlight-text {
    color: #4ade80;
    font-weight: 600;
  }
  .heatmap-container {
    padding: var(--spacing-lg) var(--spacing-md);
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
    position: relative;
    display: flex;
    justify-content: center;
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
    gap: 6px;
    min-width: max-content;
    text-align: left;
  }
  .months-header {
    padding-left: 28px;
    display: grid;
    gap: 4px;
    height: 18px;
    margin-bottom: 2px;
  }
  .month-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 500;
    line-height: 18px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .calendar-body {
    display: flex;
    gap: 6px;
  }
  .days-column {
    display: grid;
    grid-template-rows: repeat(7, 15px);
    gap: 4px;
    width: 22px;
    text-align: right;
  }
  .day-label {
    font-size: 10px;
    line-height: 15px;
    color: var(--muted);
    font-weight: 500;
  }
  .heatmap-grid {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 15px;
    gap: 4px;
  }
  .cell-empty {
    width: 15px;
    height: 15px;
  }
  .heatmap-cell {
    width: 15px;
    height: 15px;
    border-radius: 3px;
    border: 1px solid transparent;
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s, border-color 0.15s;
    cursor: pointer;
  }
  .heatmap-cell:hover {
    transform: scale(1.4);
    z-index: 10;
    position: relative;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.7) !important;
    border-color: #ffffff !important;
  }

  /* HIGH-CONTRAST DISTINCT COLOR SCALE */
  /* Level 0: Inactive / Empty (Clear outline on dark background) */
  .heatmap-cell.lvl-0 {
    background-color: rgba(255, 255, 255, 0.045);
    border-color: rgba(255, 255, 255, 0.08);
  }
  .heatmap-cell.lvl-0:hover {
    background-color: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
  }

  /* Level 1: Low Usage (Deep Forest / Teal Green - Dark & Muted) */
  .heatmap-cell.lvl-1 {
    background-color: #0d4429;
    border-color: #1b6a3f;
  }

  /* Level 2: Medium Usage (Rich Medium Emerald - Clearly Vibrant) */
  .heatmap-cell.lvl-2 {
    background-color: #007a3d;
    border-color: #10b981;
    box-shadow: 0 0 3px rgba(16, 185, 129, 0.3);
  }

  /* Level 3: High Usage (Bright Emerald / Jade - Luminous & Strong) */
  .heatmap-cell.lvl-3 {
    background-color: #10b981;
    border-color: #6ee7b7;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  }

  /* Level 4: Peak Usage (Electric Lime / Neon Sunburst - Intense Glow) */
  .heatmap-cell.lvl-4 {
    background-color: #39d353;
    border-color: #a7f3d0;
    box-shadow: 0 0 12px rgba(57, 211, 83, 0.95), inset 0 0 4px #ffffff;
  }

  /* Footer & Legend */
  .heatmap-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--spacing-sm);
    padding-top: var(--spacing-xs);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 10px;
    color: var(--muted);
  }
  .footer-hint {
    color: var(--muted);
  }
  .legend-scale {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .scale-text {
    font-size: 10px;
    color: var(--muted);
    padding: 0 2px;
  }
  .scale-cell {
    width: 13px;
    height: 13px;
    border-radius: 2px;
    border: 1px solid transparent;
  }
  .scale-cell.lvl-0 { background: rgba(255, 255, 255, 0.045); border-color: rgba(255, 255, 255, 0.08); }
  .scale-cell.lvl-1 { background: #0d4429; border-color: #1b6a3f; }
  .scale-cell.lvl-2 { background: #007a3d; border-color: #10b981; }
  .scale-cell.lvl-3 { background: #10b981; border-color: #6ee7b7; box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); }
  .scale-cell.lvl-4 { background: #39d353; border-color: #a7f3d0; box-shadow: 0 0 8px rgba(57, 211, 83, 0.85); }

  /* Popover styles */
  .heatmap-popover {
    position: fixed;
    z-index: 10000;
    transform: translate(-50%, calc(-100% - 10px));
    min-width: 230px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);
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

  .popover-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .popover-date {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .popover-badge {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .popover-badge.lvl-1 { background: rgba(13, 68, 41, 0.8); color: #86efac; border: 1px solid #1b6a3f; }
  .popover-badge.lvl-2 { background: rgba(0, 122, 61, 0.8); color: #bbf7d0; border: 1px solid #10b981; }
  .popover-badge.lvl-3 { background: rgba(16, 185, 129, 0.8); color: #ffffff; border: 1px solid #6ee7b7; }
  .popover-badge.lvl-4 { background: rgba(57, 211, 83, 0.9); color: #000000; font-weight: 700; border: 1px solid #a7f3d0; }

  .popover-divider {
    height: 1px;
    background: var(--line);
    margin: 8px 0;
  }
  .popover-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 0;
  }
  .popover-row--highlight {
    padding: 4px 0;
  }
  .popover-label {
    font-size: 11px;
    color: var(--muted);
  }
  .popover-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .popover-value--accent {
    font-size: 16px;
    font-weight: 700;
    color: #4ade80;
  }
</style>
