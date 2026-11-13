<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import type { DashboardSession, ModelTokenBreakdown } from '../../types';
  import { formatDate, formatNumber, formatPercent, formatSource, formatUsd } from '../lib/formatters';

  export let session: DashboardSession | null = null;

  const dispatch = createEventDispatcher<{ close: void }>();

  function handleClose() {
    dispatch('close');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && session) {
      handleClose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  type ModelRow = {
    model: string;
    breakdown?: ModelTokenBreakdown;
    totalTokens: number;
    costUsd?: number;
    cacheSavedUsd?: number;
    cacheHitRate?: number;
    pricingStatus: 'priced' | 'unpriced';
    pricingNote?: string;
  };

  $: modelRows = (() => {
    if (!session) return [] as ModelRow[];
    const rows: ModelRow[] = [];
    const breakdowns = session.modelBreakdowns ?? {};
    const totals = session.modelTotals ?? {};
    const costs = session.modelCosts ?? {};
    const modelNames = Array.from(new Set([...Object.keys(breakdowns), ...Object.keys(totals)]));

    for (const model of modelNames) {
      const mb = breakdowns[model];
      const totalTokens = mb?.totalTokens ?? totals[model] ?? 0;
      if (totalTokens <= 0) continue;
      const costInfo = costs[model];
      rows.push({
        model,
        breakdown: mb,
        totalTokens,
        costUsd: costInfo?.costUsd,
        cacheSavedUsd: costInfo?.cacheSavedUsd,
        cacheHitRate: costInfo?.cacheHitRate,
        pricingStatus: costInfo?.pricingStatus ?? 'unpriced',
        pricingNote: costInfo?.pricingNote
      });
    }

    return rows.sort((a, b) => b.totalTokens - a.totalTokens);
  })();

  $: activities = session?.activityBreakdown ?? [];
  $: maxActivityValue = Math.max(
    ...activities.map((item) => item.totalTokens || item.callCount || item.stepCount),
    1
  );
  $: totalActivityTokens = activities.reduce((sum, item) => sum + item.totalTokens, 0);

  function sortedTools(tools: Record<string, number>): Array<[string, number]> {
    return Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }
</script>

{#if session}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="presentation" on:click={handleBackdropClick}>
    <div
      class="modal-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-detail-title"
    >
      <header class="modal-header">
        <div class="header-main">
          <h2 id="session-detail-title" class="modal-title">{session.label}</h2>
          <div class="header-tags">
            <span class="tag" class:status-archived={session.status === 'archived'}>{session.status}</span>
            <span class="tag mode-{session.mode}">{session.mode}</span>
            <span class="tag source">{formatSource(session.source)}</span>
            <span class="meta-time">最近更新：{formatDate(session.lastModifiedMs)}</span>
          </div>
        </div>
        <button class="close-btn" type="button" on:click={handleClose} aria-label="关闭详情">
          ×
        </button>
      </header>

      <div class="modal-body">
        <section class="summary-strip" aria-label="会话关键指标">
          <div class="kpi-tile">
            <span class="tile-label">总 Token 消耗</span>
            <span class="tile-value mono">{formatNumber(session.latest.totalTokens)}</span>
            <span class="tile-sub">{formatNumber(session.messageCount)} 条消息</span>
          </div>
          <div class="kpi-tile">
            <span class="tile-label">预估费用</span>
            <span class="tile-value mono">
              {session.costUsd !== undefined ? formatUsd(session.costUsd) : '暂无报价'}
            </span>
            <span class="tile-sub">
              {session.pricingStatus === 'priced'
                ? '模型已匹配单价'
                : session.pricingStatus === 'partial'
                  ? '部分模型已匹配'
                  : '等待计费匹配'}
            </span>
          </div>
          <div class="kpi-tile">
            <span class="tile-label">缓存命中率</span>
            <span class="tile-value mono accent">
              {session.cacheHitRate !== undefined ? formatPercent(session.cacheHitRate) : '—'}
            </span>
            <span class="tile-sub">
              缓存读取 {formatNumber(session.latest.cacheReadTokens)}
            </span>
          </div>
          <div class="kpi-tile">
            <span class="tile-label">缓存累计节省</span>
            <span class="tile-value mono accent">
              {session.cacheSavedUsd !== undefined ? formatUsd(session.cacheSavedUsd) : '—'}
            </span>
            <span class="tile-sub">对比标准输入成本</span>
          </div>
        </section>

        <section class="detail-section">
          <div class="section-head">
            <h3>Token 构成</h3>
          </div>
          <div class="token-pills">
            <span class="token-pill">输入 {formatNumber(session.latest.inputTokens)}</span>
            <span class="token-pill">输出 {formatNumber(session.latest.outputTokens)}</span>
            <span class="token-pill">缓存读取 {formatNumber(session.latest.cacheReadTokens)}</span>
            <span class="token-pill">缓存写入 {formatNumber(session.latest.cacheWriteTokens)}</span>
            <span class="token-pill">推理 {formatNumber(session.latest.reasoningTokens)}</span>
          </div>
        </section>

        <section class="detail-section">
          <div class="section-head">
            <h3>模型使用与成本分布</h3>
            <span class="section-note">{modelRows.length} 个模型</span>
          </div>
          {#if modelRows.length > 0}
            <div class="table-wrap">
              <table class="model-table">
                <thead>
                  <tr>
                    <th>模型</th>
                    <th class="num">输入 / 缓存读</th>
                    <th class="num">输出 / 推理</th>
                    <th class="num">总计 Tokens</th>
                    <th class="num">缓存节省</th>
                    <th class="num">预估费用</th>
                  </tr>
                </thead>
                <tbody>
                  {#each modelRows as row (row.model)}
                    <tr>
                      <td class="mono model-col">{row.model}</td>
                      <td class="num mono">
                        {#if row.breakdown}
                          {formatNumber(row.breakdown.inputTokens)} / {formatNumber(row.breakdown.cacheReadTokens)}
                        {:else}
                          —
                        {/if}
                      </td>
                      <td class="num mono">
                        {#if row.breakdown}
                          {formatNumber(row.breakdown.outputTokens)} / {formatNumber(row.breakdown.reasoningTokens)}
                        {:else}
                          —
                        {/if}
                      </td>
                      <td class="num mono">{formatNumber(row.totalTokens)}</td>
                      <td class="num mono accent">
                        {#if row.cacheSavedUsd !== undefined && row.cacheSavedUsd > 0}
                          {formatUsd(row.cacheSavedUsd)}
                          {#if row.cacheHitRate !== undefined}
                            <span class="sub-inline">({formatPercent(row.cacheHitRate)})</span>
                          {/if}
                        {:else if row.cacheHitRate !== undefined}
                          {formatPercent(row.cacheHitRate)}
                        {:else}
                          —
                        {/if}
                      </td>
                      <td class="num mono">
                        {#if row.pricingStatus === 'priced' && row.costUsd !== undefined}
                          {formatUsd(row.costUsd)}
                        {:else}
                          <span class="muted-text">{row.pricingNote ?? '暂无报价'}</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="empty-box">该会话未记录分模型 Token 统计。</div>
          {/if}
        </section>

        <section class="detail-section">
          <div class="section-head">
            <h3>工具与操作类型归因</h3>
            <span class="section-note">按步骤调用与归因 Token 汇总</span>
          </div>
          {#if activities.length > 0}
            <div class="activity-list">
              {#each activities as activity (activity.category)}
                {@const barValue = activity.totalTokens > 0 ? activity.totalTokens : (activity.callCount || activity.stepCount)}
                {@const sharePct = totalActivityTokens > 0 ? (activity.totalTokens / totalActivityTokens) : undefined}
                <div class="activity-item">
                  <div class="activity-top">
                    <div class="activity-title-row">
                      <span class="activity-label">{activity.label}</span>
                      <span class="activity-counts">
                        {#if activity.callCount > 0}
                          {formatNumber(activity.callCount)} 次调用
                        {:else}
                          {formatNumber(activity.stepCount)} 步
                        {/if}
                      </span>
                    </div>
                    <div class="activity-metrics mono">
                      <span>{formatNumber(activity.totalTokens)} Tokens</span>
                      {#if sharePct !== undefined}
                        <span class="muted-text">({formatPercent(sharePct)})</span>
                      {/if}
                      {#if activity.costUsd !== undefined}
                        <span class="accent">• {formatUsd(activity.costUsd)}</span>
                      {/if}
                    </div>
                  </div>
                  <div class="bar-track">
                    <div
                      class="bar-fill cat-{activity.category}"
                      style="width: {Math.max((barValue / maxActivityValue) * 100, 3)}%"
                    ></div>
                  </div>
                  {#if Object.keys(activity.tools).length > 0}
                    <div class="tool-chips">
                      {#each sortedTools(activity.tools) as [toolName, count]}
                        <span class="tool-chip mono">{toolName} ×{count}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <div class="empty-box">
              暂无步骤或工具归因数据（仅 RPC v2 产物导出会话支持按工具与推理类别拆解）。
            </div>
          {/if}
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--modal-backdrop, rgba(8, 12, 16, 0.56));
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-lg);
    z-index: 100;
  }
  .modal-dialog {
    width: min(860px, 100%);
    max-height: 88vh;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    box-shadow: 0 20px 56px color-mix(in srgb, #000 35%, transparent);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--spacing-md);
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--line);
    background: var(--surface-subtle);
  }
  .header-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .modal-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--font-display);
    word-break: break-word;
  }
  .header-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .meta-time {
    font-size: 11px;
    color: var(--muted);
  }
  .tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
    border: 1px solid var(--line);
    color: var(--muted);
    background: var(--surface-muted);
  }
  .status-archived {
    border-style: dashed;
  }
  .mode-reported {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent-border);
  }
  .mode-estimated {
    background: color-mix(in srgb, var(--warm) 14%, transparent);
    color: var(--warm);
    border-color: color-mix(in srgb, var(--warm) 35%, transparent);
  }
  .close-btn {
    border: 1px solid var(--line);
    background: var(--surface-subtle);
    color: var(--text);
    width: 28px;
    height: 28px;
    border-radius: 6px;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
  }
  .close-btn:hover {
    background: var(--surface-hover);
  }
  .modal-body {
    padding: var(--spacing-lg);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }
  .summary-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--spacing-sm);
  }
  .kpi-tile {
    background: var(--surface-subtle);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .tile-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  .tile-value {
    font-size: 18px;
    color: var(--text);
  }
  .tile-sub {
    font-size: 11px;
    color: var(--muted);
  }
  .detail-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .section-head h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .section-note {
    font-size: 11px;
    color: var(--muted);
  }
  .token-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .token-pill {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface-muted);
    border: 1px solid var(--surface-line);
    font-size: 11px;
    font-family: var(--code-font);
    color: var(--text);
  }
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .model-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .model-table th,
  .model-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--surface-line);
    text-align: left;
  }
  .model-table th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    background: var(--surface-subtle);
  }
  .model-table tbody tr:last-child td {
    border-bottom: none;
  }
  .num {
    text-align: right !important;
    font-variant-numeric: tabular-nums;
  }
  .mono {
    font-family: var(--code-font);
  }
  .accent {
    color: var(--accent);
    font-weight: 500;
  }
  .muted-text {
    color: var(--muted);
  }
  .sub-inline {
    color: var(--muted);
    font-size: 11px;
  }
  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .activity-item {
    border: 1px solid var(--surface-line);
    background: var(--surface-subtle);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .activity-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .activity-title-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .activity-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
  .activity-counts {
    font-size: 11px;
    color: var(--muted);
  }
  .activity-metrics {
    font-size: 11px;
    color: var(--text);
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .bar-track {
    height: 6px;
    background: var(--surface-muted);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-strong));
    border-radius: 3px;
  }
  .bar-fill.cat-file_edit { background: #3b82f6; }
  .bar-fill.cat-file_read { background: #10b981; }
  .bar-fill.cat-search { background: #8b5cf6; }
  .bar-fill.cat-command { background: #f59e0b; }
  .bar-fill.cat-agent { background: #06b6d4; }
  .bar-fill.cat-thinking_response { background: #64748b; }
  .tool-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .tool-chip {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--surface-muted);
    border: 1px solid var(--surface-line);
    color: var(--muted);
  }
  .empty-box {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
    border: 1px dashed var(--line);
    border-radius: var(--radius-sm);
  }
  @media (max-width: 680px) {
    .summary-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
