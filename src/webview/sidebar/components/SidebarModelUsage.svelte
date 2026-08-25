<script lang="ts">
  import type { ModelUsageBreakdown } from '../../../types';
  import { formatCompact, formatUsd } from '../../lib/formatters';

  export let models: ModelUsageBreakdown[];

  const MAX_VISIBLE = 5;

  $: visibleModels = models.slice(0, MAX_VISIBLE);
  $: hiddenCount = Math.max(0, models.length - MAX_VISIBLE);
  $: maxTokens = Math.max(...models.map(m => m.totalTokens), 1);
</script>

<section class="model-usage">
  <h3 class="section-label">模型使用量</h3>

  {#if visibleModels.length > 0}
    <div class="model-list">
      {#each visibleModels as model}
        <div class="model-item">
          <div class="model-header">
            <span class="model-name" title={model.model}>{model.model}</span>
            <span class="model-tokens">{formatCompact(model.totalTokens)}</span>
          </div>
          <div class="bar-track">
            <div
              class="bar-fill"
              style="width: {(model.totalTokens / maxTokens) * 100}%"
            ></div>
          </div>
          <div class="model-meta">
            {model.sessionCount} session{model.sessionCount !== 1 ? 's' : ''}
            {#if model.pricingStatus === 'priced' && model.costUsd !== undefined}
              • {formatUsd(model.costUsd)}
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if hiddenCount > 0}
      <div class="more-label">+{hiddenCount} more model{hiddenCount !== 1 ? 's' : ''}</div>
    {/if}
  {:else}
    <div class="empty">暂无模型数据。</div>
  {/if}
</section>

<style>
  .model-usage {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .section-label {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .model-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .model-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .model-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--spacing-xs);
  }
  .model-name {
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
    font-family: var(--code-font);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .model-tokens {
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
    font-family: var(--code-font);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .bar-track {
    height: 3px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 1.5px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--surface-line);
  }
  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-strong));
    border-radius: 1.5px;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .model-meta {
    font-size: 10px;
    color: var(--muted);
  }
  .more-label {
    font-size: 10px;
    color: var(--muted);
    text-align: center;
    padding: var(--spacing-xs) 0;
  }
  .empty {
    font-size: 11px;
    color: var(--muted);
    text-align: center;
    padding: var(--spacing-md) 0;
  }
</style>
