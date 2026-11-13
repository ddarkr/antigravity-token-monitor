<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DashboardSession } from '../../types';
  import { formatDate, formatNumber, formatPercent, formatSource, formatUsd } from '../lib/formatters';
  import SparkBars from './SparkBars.svelte';

  export let sessions: DashboardSession[];

  const dispatch = createEventDispatcher<{ select: string }>();

  function selectSession(sessionId: string) {
    dispatch('select', sessionId);
  }

  function handleRowKeydown(event: KeyboardEvent, sessionId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectSession(sessionId);
    }
  }
</script>

<article class="analytical-table-container">
  <div class="table-header">
    <h2 class="section-title">会话明细分析</h2>
    <div class="table-meta">按最近活跃时间排序 · 点击行查看模型与工具拆解</div>
  </div>

  <div class="table-scroll-area">
    <table class="data-table">
      <thead>
        <tr>
          <th class="col-session">会话名称</th>
          <th class="col-mode">状态与来源</th>
          <th class="col-messages num">消息数</th>
          <th class="col-total num">总 Tokens</th>
          <th class="col-cost num">预估费用</th>
          <th class="col-delta num">近期增量</th>
          <th class="col-pulse">活跃趋势</th>
          <th class="col-action" aria-hidden="true"></th>
        </tr>
      </thead>
      <tbody>
        {#if sessions.length > 0}
          {#each sessions as session (session.sessionId)}
            <tr
              class="data-row clickable"
              tabindex="0"
              role="button"
              aria-label={`查看会话详情：${session.label}`}
              on:click={() => selectSession(session.sessionId)}
              on:keydown={(e) => handleRowKeydown(e, session.sessionId)}
            >
              <td class="col-session">
                <div class="session-info">
                  <div class="session-name">{session.label}</div>
                  <div class="session-details">
                    <span>{formatDate(session.lastModifiedMs)}</span>
                    {#if session.status === 'archived'}
                      <span class="dot-separator">•</span>
                      <span>最后活跃于 {formatDate(session.lastSeenAt)}</span>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="col-mode">
                <div class="tags">
                  <span class:tag={true} class:status-archived={session.status === 'archived'}>
                    {session.status}
                  </span>
                  <span class="tag mode-{session.mode}">{session.mode}</span>
                  <span class="tag source-{session.source}">{formatSource(session.source)}</span>
                </div>
              </td>
              <td class="col-messages num">
                <span class="value-large">{formatNumber(session.messageCount)}</span>
              </td>
              <td class="col-total num">
                <span class="value-large">{formatNumber(session.latest.totalTokens)}</span>
              </td>
              <td class="col-cost num">
                {#if session.costUsd !== undefined}
                  <div class="cost-cell">
                    <span class="value-large">{formatUsd(session.costUsd)}</span>
                    {#if session.cacheSavedUsd !== undefined && session.cacheSavedUsd > 0}
                      <span class="cost-sub">省 {formatUsd(session.cacheSavedUsd)}</span>
                    {:else if session.cacheHitRate !== undefined}
                      <span class="cost-sub">命中 {formatPercent(session.cacheHitRate)}</span>
                    {/if}
                  </div>
                {:else}
                  <span class="delta-neutral">—</span>
                {/if}
              </td>
              <td class="col-delta num">
                {#if session.latestDelta.totalTokens > 0}
                  <span class="delta-positive">+{formatNumber(session.latestDelta.totalTokens)}</span>
                {:else}
                  <span class="delta-neutral">0</span>
                {/if}
              </td>
              <td class="col-pulse">
                <div class="spark-container">
                  <SparkBars series={session.recentTotals} />
                </div>
              </td>
              <td class="col-action" aria-hidden="true">
                <span class="row-chevron">›</span>
              </td>
            </tr>
          {/each}
        {:else}
          <tr>
            <td colspan="8" class="empty-state">
              <div class="empty-message">暂未发现 Antigravity 会话记录。</div>
              <div class="empty-submessage">请确认会话目录并在下次同步时查看。</div>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</article>

<style>
  .analytical-table-container {
    background: var(--deck-bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: var(--shadow-elevated);
  }
  .table-header {
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--line);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface-subtle);
  }
  .section-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--font-display);
    letter-spacing: -0.01em;
  }
  .table-meta {
    font-size: 11px;
    color: var(--muted);
  }
  .table-scroll-area {
    overflow-x: auto;
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  th {
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    border-bottom: 1px solid var(--line);
    background: var(--surface-subtle);
    white-space: nowrap;
    text-align: left;
  }
  td {
    padding: 12px var(--spacing-md);
    border-bottom: 1px solid var(--surface-line);
    vertical-align: middle;
  }
  tbody tr {
    transition: background-color 120ms;
  }
  tbody tr.clickable {
    cursor: pointer;
  }
  tbody tr:hover {
    background: var(--surface-subtle);
  }
  tbody tr.clickable:hover .row-chevron {
    color: var(--accent);
    transform: translateX(2px);
  }
  tbody tr:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .col-session { width: 32%; }
  .col-mode { width: 18%; }
  .col-messages { width: 8%; }
  .col-total { width: 13%; }
  .col-cost { width: 12%; }
  .col-delta { width: 9%; }
  .col-pulse { width: 6%; }
  .col-action { width: 2%; text-align: right; padding-left: 4px; }

  .row-chevron {
    display: inline-block;
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
    transition: transform 140ms ease, color 140ms ease;
  }

  .cost-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .cost-sub {
    font-size: 10px;
    color: var(--accent);
    font-family: var(--code-font);
  }

  .session-info {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  .session-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }
  .session-details {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: 10px;
    color: var(--muted);
  }
  .mono {
    font-family: var(--code-font);
  }
  .dot-separator {
    opacity: 0.5;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }
  .tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .status-archived {
    background: var(--surface-subtle);
    color: var(--muted);
    border: 1px dashed var(--line);
  }
  .mode-reported {
    background: var(--accent-soft);
    color: var(--accent);
    border: 1px solid var(--accent-border);
  }
  .mode-estimated {
    background: color-mix(in srgb, var(--warm) 14%, transparent);
    color: var(--warm);
    border: 1px solid color-mix(in srgb, var(--warm) 35%, transparent);
  }
  .source-rpc-artifact {
    background: var(--surface-muted);
    color: var(--muted);
    border: 1px solid var(--line);
  }
  .source-filesystem {
    background: var(--surface-subtle);
    color: var(--muted);
    border: 1px solid var(--line);
  }

  .value-large {
    font-size: 13px;
    font-weight: 500;
    font-family: var(--code-font);
    color: var(--text);
  }
  .delta-positive {
    color: var(--accent);
    font-weight: 500;
    background: var(--accent-soft);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--code-font);
  }
  .delta-neutral {
    color: var(--muted);
    font-family: var(--code-font);
  }

  .spark-container {
    width: 80px;
    height: 24px;
  }

  .empty-state {
    padding: 64px 24px;
    text-align: center;
  }
  .empty-message {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
    margin-bottom: 4px;
  }
  .empty-submessage {
    font-size: 13px;
    color: var(--muted);
  }
</style>
