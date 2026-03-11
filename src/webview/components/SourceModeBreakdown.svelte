<script lang="ts">
  import type { RpcCoverageBreakdown } from '../../types';
  import { formatNumber } from '../lib/formatters';

  export let coverage: RpcCoverageBreakdown;
  export let exportedInLastRun: number;

  $: stableSessions = Math.max(coverage.trackedSessions - coverage.changedSessions, 0);
  $: activeShare = coverage.trackedSessions > 0 ? (coverage.changedSessions / coverage.trackedSessions) * 100 : 0;
  $: exportedShare = coverage.trackedSessions > 0 ? (coverage.exportedSessions / coverage.trackedSessions) * 100 : 0;
</script>

<article class="analytical-card">
  <div class="card-header">
    <h2 class="section-title">RPC Coverage</h2>
    <div class="card-meta">Exported artifact monitoring scope</div>
  </div>

  <div class="card-body">
    <div class="breakdown-section">
      <h3 class="subsection-title">Tracking Scope</h3>
      <div class="breakdown-list">
        <div class="breakdown-item">
          <div class="item-info">
            <span class="item-name tag tag-neutral">Tracked Sessions</span>
            <span class="item-stats">{formatNumber(coverage.trackedSessions)} sessions</span>
          </div>
          <div class="bar-container">
            <div class="bar bar-neutral" style="width: 100%"></div>
          </div>
        </div>
        <div class="breakdown-item">
          <div class="item-info">
            <span class="item-name tag tag-active">Changed Sessions</span>
            <span class="item-stats">{formatNumber(coverage.changedSessions)} sessions</span>
          </div>
          <div class="bar-container">
            <div class="bar bar-active" style="width: {activeShare}%"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="breakdown-section">
      <h3 class="subsection-title">Export Health</h3>
      <div class="breakdown-list">
        <div class="breakdown-item">
          <div class="item-info">
            <span class="item-name tag tag-exported">Exported Scope</span>
            <span class="item-stats">{formatNumber(coverage.exportedSessions)} sessions</span>
          </div>
          <div class="bar-container">
            <div class="bar bar-exported" style="width: {exportedShare}%"></div>
          </div>
        </div>
        <div class="breakdown-item compact-note">
          <div class="note-row">
            <span>Last export wrote</span>
            <strong>{formatNumber(exportedInLastRun)}</strong>
          </div>
          <div class="note-row">
            <span>Stable sessions</span>
            <strong>{formatNumber(stableSessions)}</strong>
          </div>
        </div>
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
  .breakdown-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .subsection-title {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .breakdown-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .breakdown-item {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  .item-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .item-stats {
    font-size: 11px;
    color: var(--muted);
  }
  .bar-container {
    height: 3px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 1.5px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--surface-line);
  }
  .bar {
    height: 100%;
    border-radius: 1.5px;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .divider {
    height: 1px;
    background: var(--line);
  }

  .tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .tag-neutral {
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    border: 1px solid var(--line);
  }
  .tag-active {
    background: rgba(136, 216, 176, 0.1);
    color: var(--accent-strong);
    border: 1px solid rgba(136, 216, 176, 0.2);
  }
  .tag-exported {
    background: rgba(115, 184, 255, 0.1);
    color: #9fd5ff;
    border: 1px solid rgba(115, 184, 255, 0.24);
  }
  .bar-neutral {
    background: rgba(255, 255, 255, 0.35);
  }
  .bar-active {
    background: var(--accent-strong);
  }
  .bar-exported {
    background: #73b8ff;
  }
  .compact-note {
    gap: var(--spacing-sm);
    padding-top: var(--spacing-xs);
  }
  .note-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--muted);
    font-size: 11px;
  }
  .note-row strong {
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
  }
</style>
