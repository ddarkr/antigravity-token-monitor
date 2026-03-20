<script lang="ts">
  import type { DashboardSession } from '../../types';
  import { formatNumber, formatDate, formatSource } from '../lib/formatters';
  import SparkBars from './SparkBars.svelte';

  export let sessions: DashboardSession[];


</script>

<article class="analytical-table-container">
  <div class="table-header">
    <h2 class="section-title">Session Analysis</h2>
    <div class="table-meta">Sorted by recent activity</div>
  </div>

  <div class="table-scroll-area">
    <table class="data-table">
      <thead>
        <tr>
          <th class="col-session">Session</th>
          <th class="col-mode">Mode</th>
          <th class="col-messages num">Messages</th>
          <th class="col-total num">Total Tokens</th>
          <th class="col-delta num">Latest Delta</th>
          <th class="col-pulse">Activity Pulse</th>
        </tr>
      </thead>
      <tbody>
        {#if sessions.length > 0}
          {#each sessions as session (session.sessionId)}
            <tr class="data-row">
              <td class="col-session">
                <div class="session-info">
                  <div class="session-name">{session.label}</div>
                  <div class="session-details">
                    <span>{formatDate(session.lastModifiedMs)}</span>
                    {#if session.status === 'archived'}
                      <span class="dot-separator">•</span>
                      <span>Last seen {formatDate(session.lastSeenAt)}</span>
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
            </tr>
          {/each}
        {:else}
          <tr>
            <td colspan="6" class="empty-state">
              <div class="empty-message">No Antigravity sessions found yet.</div>
              <div class="empty-submessage">Check the session root and wait for the next poll.</div>
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
    background: rgba(255, 255, 255, 0.02);
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
    background: rgba(255, 255, 255, 0.01);
    white-space: nowrap;
    text-align: left;
  }
  td {
    padding: var(--spacing-md) var(--spacing-md);
    border-bottom: 1px solid var(--surface-line);
    vertical-align: middle;
  }
  tbody tr {
    transition: background-color 120ms;
  }
  tbody tr:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .col-session { width: 40%; }
  .col-mode { width: 20%; }
  .col-messages { width: 10%; }
  .col-total { width: 15%; }
  .col-delta { width: 15%; }
  .col-pulse { width: 10%; }

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
    background: rgba(255, 255, 255, 0.03);
    color: var(--muted);
    border: 1px dashed rgba(255, 255, 255, 0.15);
  }
  .mode-reported {
    background: rgba(136, 216, 176, 0.1);
    color: var(--accent-strong);
    border: 1px solid rgba(136, 216, 176, 0.2);
  }
  .mode-estimated {
    background: rgba(247, 200, 115, 0.1);
    color: var(--warm);
    border: 1px solid rgba(247, 200, 115, 0.2);
  }
  .source-rpc-artifact {
    background: rgba(255, 255, 255, 0.05);
    color: var(--muted);
    border: 1px solid var(--line);
  }
  .source-filesystem {
    background: rgba(255, 255, 255, 0.02);
    color: var(--muted);
    border: 1px solid var(--line);
  }

  .value-large {
    font-size: 14px;
    font-weight: 400;
    font-family: var(--code-font);
    color: var(--text);
  }
  .delta-positive {
    color: var(--accent-strong);
    font-weight: 500;
    background: rgba(136, 216, 176, 0.1);
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
