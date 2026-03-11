<script lang="ts">
  import type { ModelUsageBreakdown } from '../../types';
  import { formatNumber, formatUsd } from '../lib/formatters';

  export let models: ModelUsageBreakdown[];

  $: maxTokens = Math.max(...models.map(m => m.totalTokens), 1);
</script>

<article class="analytical-card">
  <div class="card-header">
    <h2 class="section-title">Model Usage</h2>
    <div class="card-meta">Ranked by total tokens</div>
  </div>

  <div class="card-body">
    {#if models.length > 0}
      <div class="model-list">
        {#each models as model}
          <div class="model-item">
            <div class="model-info">
              <span class="model-name">{model.model}</span>
              <span class="model-stats">
                {formatNumber(model.totalTokens)} tokens • {model.sessionCount} sessions
                {#if model.pricingStatus === 'priced' && model.costUsd !== undefined}
                  • {formatUsd(model.costUsd)}
                {:else if model.pricingNote}
                  • {model.pricingNote}
                {/if}
              </span>
            </div>
            <div class="bar-container">
              <div class="bar" style="width: {(model.totalTokens / maxTokens) * 100}%"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty-state">No model usage data available.</div>
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
  }
  .model-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .model-item {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  .model-info {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .model-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
    font-family: var(--code-font);
  }
  .model-stats {
    font-size: 11px;
    color: var(--muted);
  }
  .bar-container {
    height: 4px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 2px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--surface-line);
  }
  .bar {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-strong));
    border-radius: 2px;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .empty-state {
    color: var(--muted);
    font-size: 13px;
    text-align: center;
    padding: var(--spacing-xl) 0;
  }
</style>
