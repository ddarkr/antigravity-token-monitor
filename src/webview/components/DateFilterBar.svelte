<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DateFilterOption } from '../lib/deriveDashboardInsights';

  export let selectedRange: DateFilterOption['range'] = 'all';
  export let customStart: string = '';
  export let customEnd: string = '';

  const dispatch = createEventDispatcher<{
    change: DateFilterOption;
  }>();

  function select(range: DateFilterOption['range']) {
    selectedRange = range;
    dispatch('change', { range, customStart, customEnd });
  }

  function handleCustomChange() {
    selectedRange = 'custom';
    dispatch('change', { range: 'custom', customStart, customEnd });
  }
</script>

<div class="filter-wrapper">
  <div class="filter-title">
    <svg viewBox="0 0 24 24" class="calendar-icon" width="14" height="14">
      <path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/>
    </svg>
    <span>时间筛选：</span>
  </div>

  <div class="filter-pills">
    <button class="pill" class:active={selectedRange === 'all'} on:click={() => select('all')}>全部时间</button>
    <button class="pill" class:active={selectedRange === 'today'} on:click={() => select('today')}>今天</button>
    <button class="pill" class:active={selectedRange === '24h'} on:click={() => select('24h')}>近 24 小时</button>
    <button class="pill" class:active={selectedRange === '7d'} on:click={() => select('7d')}>近 7 天</button>
    <button class="pill" class:active={selectedRange === '30d'} on:click={() => select('30d')}>近 30 天</button>
    <button class="pill" class:active={selectedRange === 'custom'} on:click={() => select('custom')}>📅 自定义范围</button>
  </div>

  {#if selectedRange === 'custom'}
    <div class="custom-picker">
      <input type="date" bind:value={customStart} on:change={handleCustomChange} class="date-input" />
      <span class="range-sep">至</span>
      <input type="date" bind:value={customEnd} on:change={handleCustomChange} class="date-input" />
    </div>
  {/if}
</div>

<style>
  .filter-wrapper {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm, 8px);
    padding: 8px 14px;
    box-shadow: var(--shadow);
  }
  .filter-title {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .calendar-icon {
    opacity: 0.75;
    color: var(--accent);
  }
  .filter-pills {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.25);
    padding: 3px;
    border-radius: 6px;
    border: 1px solid var(--surface-line);
    flex-wrap: wrap;
  }
  .pill {
    background: transparent;
    border: 1px solid transparent;
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .pill:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.05);
  }
  .pill.active {
    color: #ffffff;
    background: rgba(59, 130, 246, 0.25);
    border-color: rgba(59, 130, 246, 0.6);
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.3);
    font-weight: 600;
  }
  .custom-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    animation: fade-in 0.18s ease;
  }
  .date-input {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line-strong);
    color: var(--text);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    font-family: var(--code-font);
    outline: none;
    color-scheme: dark;
  }
  .date-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.4);
  }
  .range-sep {
    font-size: 11px;
    color: var(--muted);
  }
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-3px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
