<script lang="ts">
  import type { DashboardState } from '../../types';
  import { formatNumber, formatUsd } from '../lib/formatters';

  export let summary: DashboardState['summary'];
  export let pricing: DashboardState['pricing'];
</script>

<section class="stat-band">
  <div class="stat-grid">
    <article class="stat-block primary">
      <div class="stat-label">Total Tokens</div>
      <div class="stat-value highlight">{formatNumber(summary.totalTokens)}</div>
      <div class="stat-context">Aggregate token volume across exported sessions</div>
    </article>

    <div class="stat-divider"></div>

    <article class="stat-block">
      <div class="stat-label">Total Sessions</div>
      <div class="stat-value">{formatNumber(summary.sessionCount)}</div>
      <div class="stat-context">Sessions currently tracked by the dashboard</div>
    </article>

    <div class="stat-divider"></div>

    <article class="stat-block">
      <div class="stat-label">Total Messages</div>
      <div class="stat-value">{formatNumber(summary.messageCount)}</div>
      <div class="stat-context">Counted from exported `steps.jsonl` rows</div>
    </article>

    <div class="stat-divider"></div>

    <article class="stat-block">
      <div class="stat-label">Total Cost</div>
      <div class="stat-value">{pricing.pricedModelCount > 0 ? formatUsd(pricing.totalCostUsd) : 'Unavailable'}</div>
      <div class="stat-context">{pricing.message}</div>
    </article>
  </div>
</section>

<style>
  .stat-band {
    background: var(--hero-bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--spacing-xl) var(--spacing-lg);
    box-shadow: var(--shadow-elevated);
    position: relative;
    overflow: hidden;
  }
  .stat-band::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    opacity: 0.5;
  }
  .stat-grid {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    position: relative;
    z-index: 1;
  }
  .stat-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: 0 var(--spacing-xl);
    border-right: 1px solid var(--line);
  }
  .stat-block:first-child {
    padding-left: 0;
    flex: 1.5;
  }
  .stat-block:last-child {
    padding-right: 0;
    border-right: none;
  }
  .stat-divider {
    display: none;
  }
  .stat-label {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-family: var(--font-display);
  }
  .stat-value {
    font-size: 36px;
    font-weight: 300;
    line-height: 1;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    font-family: var(--code-font);
    letter-spacing: -0.02em;
  }
  .stat-block:not(:first-child) .stat-value {
    font-size: 24px;
  }
  .stat-value.highlight {
    color: var(--accent-strong);
    font-weight: 400;
    text-shadow: 0 0 24px rgba(199, 242, 150, 0.2);
  }
  .stat-context {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.4;
  }
  @media (max-width: 1000px) {
    .stat-grid {
      flex-wrap: wrap;
      gap: var(--spacing-xl);
    }
    .stat-block {
      flex: 1 1 calc(50% - var(--spacing-md));
      padding: 0 !important;
      border-right: none;
    }
    .stat-block:first-child {
      flex: 1 1 100%;
    }
  }
</style>
