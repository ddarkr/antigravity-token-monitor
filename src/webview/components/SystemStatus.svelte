<script lang="ts">
  import type { DashboardState } from '../../types';
  import { formatExportStatus, formatDate, formatNumber } from '../lib/formatters';

  export let state: DashboardState;
</script>

<article class="analytical-card">
  <div class="card-header">
    <h2 class="section-title">System Status</h2>
    <div class="card-meta">Export Pipeline</div>
  </div>

  <div class="card-body">
    <div class="status-card">
      <div class="status-header">
        <div class="status-icon {state.exportStatus.status}"></div>
        <div class="status-name">Export Pipeline</div>
      </div>
      <div class="status-body">
        <div class="status-value">{formatExportStatus(state.exportStatus.status)}</div>
        <div class="status-desc">{state.exportStatus.message}</div>
      </div>
      <div class="status-footer">
        <div class="footer-label">Last Export</div>
        <div class="footer-value">
          {state.exportStatus.lastExportAt ? formatDate(state.exportStatus.lastExportAt) : 'Never'}
        </div>
        {#if state.exportStatus.lastExportedCount > 0}
          <div class="footer-sub">({formatNumber(state.exportStatus.lastExportedCount)} sessions)</div>
        {/if}
      </div>
    </div>
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
    flex: 1;
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
  .card-body {
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .status-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--surface-line);
    border-radius: 8px;
    padding: var(--spacing-sm);
  }

  .status-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
  }
  .status-icon {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .status-icon.idle { background: var(--accent); box-shadow: 0 0 8px rgba(136, 216, 176, 0.4); }
  .status-icon.running { background: var(--warm); animation: pulse 1.5s infinite; box-shadow: 0 0 8px rgba(247, 200, 115, 0.4); }
  .status-icon.error { background: var(--danger); box-shadow: 0 0 8px rgba(239, 125, 120, 0.4); }

  .status-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
  }
  .status-body {
    margin-bottom: var(--spacing-sm);
    padding-bottom: var(--spacing-sm);
    border-bottom: 1px solid var(--surface-line);
  }
  .status-value {
    font-size: 13px;
    font-weight: 500;
    margin-bottom: var(--spacing-xs);
  }
  .status-desc {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.4;
  }
  .status-footer {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .footer-label {
    font-size: 9px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .footer-value {
    font-size: 11px;
    color: var(--text);
    font-family: var(--code-font);
  }
  .footer-sub {
    font-size: 10px;
    color: var(--muted);
  }

  @keyframes pulse {
    0% { opacity: 0.5; }
    50% { opacity: 1; }
    100% { opacity: 0.5; }
  }
</style>