<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { DashboardState } from '../../types';
  import { vscodeApi } from '../lib/vscodeApi';

  export let state: DashboardState;

  let timeRemaining = 0;
  let progress = 0;
  let animationFrameId: number;
  let firedAutoRefresh = false;
  let lastSeenPollAt: number | undefined;

  function tick() {
    if (state.lastPollAt && state.config.pollIntervalMs && state.syncStatus === 'idle') {
      if (lastSeenPollAt !== state.lastPollAt) {
        lastSeenPollAt = state.lastPollAt;
        firedAutoRefresh = false;
      }

      const now = Date.now();
      const nextPollAt = state.lastPollAt + state.config.pollIntervalMs;
      const remaining = Math.max(0, nextPollAt - now);
      timeRemaining = Math.ceil(remaining / 1000);
      progress = 1 - (remaining / state.config.pollIntervalMs);

      if (remaining === 0 && !firedAutoRefresh) {
        firedAutoRefresh = true;
        vscodeApi.postMessage({ type: 'dashboard/refresh' });
      }
    } else {
      timeRemaining = 0;
      progress = 0;
      if (state.syncStatus === 'running') {
        firedAutoRefresh = false;
      }
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

<div class="header-widget">
  <div class="brand">
    <div class="logo-mark" aria-hidden="true"></div>
    <h1 class="title">Antigravity Token 监控仪表盘</h1>
  </div>

  <div class="actions">
    {#if state.syncStatus === 'idle' && state.lastPollAt && state.config.pollIntervalMs}
      <div class="countdown-container" title="将在 {timeRemaining} 秒后自动刷新">
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
      {state.syncStatus === 'running' ? '正在刷新...' : '立即刷新'}
    </button>
  </div>
</div>

<style>
  .header-widget {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--spacing-sm);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm, 8px);
    padding: var(--spacing-sm) var(--spacing-md);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
  .logo-mark {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: var(--accent);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  }
  .title {
    font-size: 11px;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
  .button {
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--text);
    border-radius: 4px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 500;
    min-height: 22px;
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
    gap: 5px;
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--muted);
    font-size: 10px;
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
    box-shadow: 0 0 6px rgba(136, 216, 176, 0.4);
  }
  .status-pill.running .status-indicator {
    background: var(--warm);
    box-shadow: 0 0 6px rgba(247, 200, 115, 0.4);
    animation: pulse 1.5s infinite;
  }
  .status-pill.error .status-indicator {
    background: var(--danger);
    box-shadow: 0 0 6px rgba(239, 125, 120, 0.4);
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
    width: 24px;
    height: 24px;
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
    transition: stroke-dashoffset 0.1s linear;
  }
  .countdown-glow {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.15;
    filter: blur(3px);
    animation: glow-pulse 2s infinite alternate;
  }
  .time-text {
    position: relative;
    font-size: 9px;
    font-weight: 700;
    color: var(--accent-strong, #fff);
    font-variant-numeric: tabular-nums;
    z-index: 1;
  }
  @keyframes glow-pulse {
    0% { opacity: 0.1; transform: scale(0.9); }
    100% { opacity: 0.4; transform: scale(1.1); }
  }

  @media (max-width: 760px) {
    .header-widget {
      align-items: flex-start;
      width: 100%;
    }
  }
</style>
