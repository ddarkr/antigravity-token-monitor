<script lang="ts">
  import type { DashboardState } from '../../../types';
  import { formatRelative } from '../../lib/formatters';

  type InsightsState = DashboardState;
  export let state: InsightsState;

  $: syncIcon = state.syncStatus === 'running' ? '↻' : state.syncStatus === 'error' ? '⚠' : '✓';
  $: exportIcon = state.exportStatus.status === 'running' ? '↻' : state.exportStatus.status === 'error' ? '⚠' : '✓';
</script>

<section class="sync-status">
  <h3 class="section-label">运行状态</h3>

  <div class="status-rows">
    <div class="status-row">
      <span class="status-icon" class:running={state.syncStatus === 'running'} class:error={state.syncStatus === 'error'}>
        {syncIcon}
      </span>
      <span class="status-text">同步</span>
      <span class="status-detail">
        {#if state.syncStatus === 'running'}
          正在刷新...
        {:else if state.lastPollAt}
          {formatRelative(state.lastPollAt)}
        {:else}
          未启动
        {/if}
      </span>
    </div>

    {#if state.config.useRpcExport}
      <div class="status-row">
        <span class="status-icon" class:running={state.exportStatus.status === 'running'} class:error={state.exportStatus.status === 'error'}>
          {exportIcon}
        </span>
        <span class="status-text">导出</span>
        <span class="status-detail">
          {#if state.exportStatus.status === 'running'}
            正在导出...
          {:else if state.exportStatus.lastExportAt}
            {formatRelative(state.exportStatus.lastExportAt)}
          {:else}
            空闲
          {/if}
        </span>
      </div>
    {/if}

    {#if state.syncStatus === 'error' && state.syncMessage}
      <div class="error-banner">
        {state.syncMessage}
      </div>
    {/if}
  </div>
</section>

<style>
  .sync-status {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding-top: var(--spacing-sm);
    border-top: 1px solid var(--line);
  }
  .section-label {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .status-rows {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .status-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: 11px;
  }
  .status-icon {
    font-size: 10px;
    width: 14px;
    text-align: center;
    color: var(--accent);
  }
  .status-icon.running {
    color: var(--warm);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .status-icon.error {
    color: var(--danger);
  }
  .status-text {
    color: var(--muted);
    font-weight: 500;
    min-width: 40px;
  }
  .status-detail {
    color: var(--muted);
    flex: 1;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .error-banner {
    font-size: 10px;
    color: var(--danger);
    background: rgba(239, 125, 120, 0.08);
    border: 1px solid rgba(239, 125, 120, 0.2);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    line-height: 1.4;
    word-break: break-word;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
