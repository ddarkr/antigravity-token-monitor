<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { DashboardState } from '../../types';
  import { vscodeApi } from '../lib/vscodeApi';

  export let state: DashboardState;

  let timeRemaining = 0;
  let progress = 0;
  let animationFrameId: number;

  function tick() {
    if (state.lastPollAt && state.config.pollIntervalMs && state.syncStatus === 'idle') {
      const now = Date.now();
      const nextPollAt = state.lastPollAt + state.config.pollIntervalMs;
      const remaining = Math.max(0, nextPollAt - now);
      timeRemaining = Math.ceil(remaining / 1000);
      progress = 1 - (remaining / state.config.pollIntervalMs);
    } else {
      timeRemaining = 0;
      progress = 0;
    }
    animationFrameId = requestAnimationFrame(tick);
  }

  onMount(() => {
    animationFrameId = requestAnimationFrame(tick);
  });

  onDestroy(() => {
    cancelAnimationFrame(animationFrameId);
  });

  function handleRefresh() {
    vscodeApi.postMessage({ type: 'dashboard/refresh' });
  }
</script>

<header class="top-bar">
  <div class="top-bar-content">
    <div class="brand">
      <div class="logo-mark" aria-hidden="true"></div>
      <h1 class="title">Antigravity Token Monitor</h1>
    </div>

    <div class="actions">
      {#if state.syncStatus === 'idle' && state.lastPollAt && state.config.pollIntervalMs}
        <div class="countdown-container" title="Next auto-refresh in {timeRemaining}s">
          <svg viewBox="0 0 24 24" class="ring-svg">
            <circle class="ring-bg" cx="12" cy="12" r="10"></circle>
            <circle class="ring-fg" cx="12" cy="12" r="10" stroke-dasharray="62.83" stroke-dashoffset="{62.83 * (1 - Math.max(0, Math.min(1, progress)))}"></circle>
          </svg>
          <div class="countdown-glow"></div>
          <span class="time-text">{timeRemaining}</span>
        </div>
      {/if}

      <div class="status-pill {state.syncStatus}">
        <span class="status-indicator"></span>
        {state.syncMessage}
      </div>
      <button class="button" on:click={handleRefresh} disabled={state.syncStatus === 'running'}>
        {state.syncStatus === 'running' ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  </div>
</header>

<style>
  .top-bar {
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(12px) saturate(125%);
  }
  .top-bar-content {
    padding: var(--spacing-sm) var(--spacing-2xl);
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1600px;
    margin: 0 auto;
    width: 100%;
    gap: var(--spacing-md);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    min-width: 0;
  }
  .logo-mark {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: var(--accent);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  }
  .title {
    font-size: 12px;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }
  .button {
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--text);
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 500;
    min-height: 24px;
    transition: all 0.2s ease;
  }
  .button:hover:not(:disabled) {
    border-color: var(--accent);
    background: rgba(255, 255, 255, 0.04);
    color: var(--accent-strong);
  }
  .button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: transparent;
  }
  .status-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--muted);
  }
  .status-pill.idle .status-indicator {
    background: var(--accent);
    box-shadow: 0 0 8px rgba(136, 216, 176, 0.4);
  }
  .status-pill.running .status-indicator {
    background: var(--warm);
    box-shadow: 0 0 8px rgba(247, 200, 115, 0.4);
    animation: pulse 1.5s infinite;
  }
  .status-pill.error .status-indicator {
    background: var(--danger);
    box-shadow: 0 0 8px rgba(239, 125, 120, 0.4);
  }
  .status-pill.error {
    color: var(--danger);
  }

  @keyframes pulse {
    0% { opacity: 0.5; }
    50% { opacity: 1; }
    100% { opacity: 0.5; }
  }

  /* Countdown Glow Styles */
  .countdown-container {
    position: relative;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ring-svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .ring-bg {
    fill: none;
    stroke: var(--line-strong, rgba(255, 255, 255, 0.1));
    stroke-width: 2;
  }
  .ring-fg {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linecap: round;
    /* Smooth out updates for circular progress */
    transition: stroke-dashoffset 0.1s linear;
  }
  .countdown-glow {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.15;
    filter: blur(4px);
    animation: glow-pulse 2s infinite alternate;
  }
  .time-text {
    position: relative;
    font-size: 10px;
    font-weight: 700;
    color: var(--accent-strong, #fff);
    font-variant-numeric: tabular-nums;
    z-index: 1;
  }
  @keyframes glow-pulse {
    0% { opacity: 0.1; transform: scale(0.9); }
    100% { opacity: 0.4; transform: scale(1.1); }
  }

  @media (max-width: 1200px) {
    .top-bar-content {
      padding: var(--spacing-sm) var(--spacing-md);
    }
  }

  @media (max-width: 760px) {
    .top-bar-content {
      flex-wrap: wrap;
      justify-content: center;
    }
    .brand {
      width: 100%;
      justify-content: center;
    }
    .actions {
      width: 100%;
      justify-content: center;
    }
  }
</style>
