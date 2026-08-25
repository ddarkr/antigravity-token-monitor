<script lang="ts">
  import { dashboardState } from '../lib/dashboardStore';
  import { deriveDashboardInsights } from '../lib/deriveDashboardInsights';
  import { sidebarApi } from './sidebarApi';
  import SidebarKpi from './components/SidebarKpi.svelte';
  import SidebarTokenMix from './components/SidebarTokenMix.svelte';
  import SidebarModelUsage from './components/SidebarModelUsage.svelte';
  import SidebarHeatmap from './components/SidebarHeatmap.svelte';
  import SidebarSessionList from './components/SidebarSessionList.svelte';
  import SidebarSyncStatus from './components/SidebarSyncStatus.svelte';

  $: insights = $dashboardState ? deriveDashboardInsights($dashboardState) : null;

  function handleRefresh() {
    sidebarApi.postMessage({ type: 'sidebar/refresh' });
  }

  function handleOpenDashboard() {
    sidebarApi.postMessage({ type: 'sidebar/openDashboard' });
  }

  function handleOpenSession(sessionId: string) {
    sidebarApi.postMessage({ type: 'sidebar/openSession', sessionId });
  }
</script>

{#if insights}
  <div class="sidebar-shell">
    <header class="sidebar-header">
      <h1 class="sidebar-title">Token 概览</h1>
      <div class="sidebar-actions">
        <button class="icon-btn" on:click={handleRefresh} title="立即刷新">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c.335.57.528 1.236.528 1.949 0 2.044-1.6 3.703-3.588 3.703-1.987 0-3.599-1.659-3.599-3.703C5.069 5.481 6.681 3.822 8.668 3.822c.32 0 .631.047.926.131l-.85.85h2.932V1.87l-.907.906A5.266 5.266 0 008.668 2.12c-2.898 0-5.244 2.421-5.244 5.405 0 2.985 2.346 5.405 5.244 5.405 2.898 0 5.244-2.42 5.244-5.405a5.44 5.44 0 00-.461-2.176v.26z"/></svg>
        </button>
        <button class="icon-btn" on:click={handleOpenDashboard} title="打开完整仪表盘">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1H6v1H2v12h12v-4h1v4.5l-.5.5h-13l-.5-.5v-13l.5-.5z"/><path d="M15 1.5V8h-1V2.707L7.243 9.465l-.707-.708L13.293 2H8V1h6.5l.5.5z"/></svg>
        </button>
      </div>
    </header>

    <main class="sidebar-content">
      <SidebarKpi summary={insights.summary} pricing={insights.pricing} />
      <SidebarTokenMix breakdown={insights.tokenBreakdown} />
      <SidebarModelUsage models={insights.analytics.modelUsage} />
      <SidebarHeatmap heatmap={insights.analytics.activityHeatmap} />
      <SidebarSessionList
        sessions={insights.sortedSessions}
        onOpenSession={handleOpenSession}
      />
      <SidebarSyncStatus state={insights} />
    </main>
  </div>
{:else}
  <div class="loading">
    <div class="loading-spinner"></div>
    <span>正在加载 Token 数据...</span>
  </div>
{/if}

<style>
  .sidebar-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    animation: fade-in 180ms ease;
  }
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.02);
    position: sticky;
    top: 0;
    z-index: 10;
    backdrop-filter: blur(12px);
  }
  .sidebar-title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .sidebar-actions {
    display: flex;
    gap: 2px;
  }
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    color: var(--muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 14px;
    transition: background 120ms, color 120ms;
  }
  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
  }
  .sidebar-content {
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    overflow-y: auto;
  }
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    height: 200px;
    color: var(--muted);
    font-size: 12px;
  }
  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--line);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
