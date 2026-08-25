<script lang="ts">
  import type { DashboardSession } from '../../../types';
  import { formatCompact, formatRelative } from '../../lib/formatters';

  export let sessions: DashboardSession[];
  export let onOpenSession: (sessionId: string) => void;

  const MAX_COLLAPSED = 5;
  let expanded = false;

  $: activeSessions = sessions.filter(s => s.status === 'active');
  $: archivedSessions = sessions.filter(s => s.status === 'archived');
  $: visibleActive = expanded ? activeSessions : activeSessions.slice(0, MAX_COLLAPSED);
  $: hiddenActiveCount = Math.max(0, activeSessions.length - MAX_COLLAPSED);

  function toggle() {
    expanded = !expanded;
  }
</script>

<section class="session-list">
  <div class="section-header">
    <h3 class="section-label">会话明细</h3>
    <span class="session-count">{activeSessions.length} 活跃</span>
  </div>

  {#if visibleActive.length > 0}
    <div class="sessions">
      {#each visibleActive as session (session.sessionId)}
        <button
          class="session-item"
          on:click={() => onOpenSession(session.sessionId)}
          title="在仪表盘中打开"
        >
          <div class="session-row">
            <span class="session-name">{session.label}</span>
            <span class="session-tokens">{formatCompact(session.latest.totalTokens)}</span>
          </div>
          <div class="session-meta">
            <span>{formatRelative(session.lastModifiedMs)}</span>
            <span>•</span>
            <span>{session.messageCount} 条消息</span>
            {#if session.latestDelta.totalTokens > 0}
              <span class="delta">+{formatCompact(session.latestDelta.totalTokens)}</span>
            {/if}
          </div>
          <div class="session-bar-track">
            <div
              class="session-bar-fill"
              class:estimated={session.mode === 'estimated'}
              style="width: {sessions.length > 0 ? (session.latest.totalTokens / Math.max(...sessions.map(s => s.latest.totalTokens), 1)) * 100 : 0}%"
            ></div>
          </div>
        </button>
      {/each}
    </div>

    {#if !expanded && hiddenActiveCount > 0}
      <button class="expand-btn" on:click={toggle}>
        展开更多 ({hiddenActiveCount})
      </button>
    {:else if expanded && hiddenActiveCount > 0}
      <button class="expand-btn" on:click={toggle}>
        Show less
      </button>
    {/if}

    {#if expanded && archivedSessions.length > 0}
      <div class="archived-divider">
        <span>{archivedSessions.length} 个已归档</span>
      </div>
      <div class="sessions">
        {#each archivedSessions as session (session.sessionId)}
          <button
            class="session-item archived"
            on:click={() => onOpenSession(session.sessionId)}
            title="在仪表盘中打开"
          >
            <div class="session-row">
              <span class="session-name">{session.label}</span>
              <span class="session-tokens">{formatCompact(session.latest.totalTokens)}</span>
            </div>
            <div class="session-meta">
              <span>{formatRelative(session.lastModifiedMs)}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="empty">暂无活跃会话。</div>
  {/if}
</section>

<style>
  .session-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .section-label {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .session-count {
    font-size: 10px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .sessions {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .session-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--spacing-sm);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    color: inherit;
    width: 100%;
    transition: background 120ms, border-color 120ms;
  }
  .session-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--line);
  }
  .session-item.archived {
    opacity: 0.5;
  }
  .session-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--spacing-xs);
  }
  .session-name {
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .session-tokens {
    font-size: 11px;
    font-family: var(--code-font);
    color: var(--text);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .session-meta {
    display: flex;
    gap: var(--spacing-xs);
    font-size: 10px;
    color: var(--muted);
    align-items: baseline;
  }
  .delta {
    color: var(--accent-strong);
    font-family: var(--code-font);
    font-weight: 500;
  }
  .session-bar-track {
    height: 2px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 1px;
    overflow: hidden;
    margin-top: 1px;
  }
  .session-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-strong));
    border-radius: 1px;
    transition: width 0.3s ease;
  }
  .session-bar-fill.estimated {
    background: linear-gradient(90deg, var(--warm), rgba(247, 200, 115, 0.6));
  }
  .expand-btn {
    background: none;
    border: 1px dashed var(--line);
    border-radius: var(--radius-sm);
    color: var(--muted);
    font-size: 10px;
    padding: var(--spacing-xs) var(--spacing-sm);
    cursor: pointer;
    transition: color 120ms, border-color 120ms;
    width: 100%;
  }
  .expand-btn:hover {
    color: var(--text);
    border-color: var(--line-strong);
  }
  .archived-divider {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: 10px;
    color: var(--muted);
    padding: var(--spacing-xs) 0;
  }
  .archived-divider::before,
  .archived-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .empty {
    font-size: 11px;
    color: var(--muted);
    text-align: center;
    padding: var(--spacing-md) 0;
  }
</style>
