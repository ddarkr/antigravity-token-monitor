<script lang="ts">
  import { dashboardState } from './lib/dashboardStore';
  import { deriveDashboardInsights } from './lib/deriveDashboardInsights';
  import HeaderBar from './components/HeaderBar.svelte';
  import KpiStrip from './components/KpiStrip.svelte';
  import SessionLeaderboard from './components/SessionLeaderboard.svelte';
  import ActivityHeatmap from './components/ActivityHeatmap.svelte';
  import ModelUsage from './components/ModelUsage.svelte';
  import SourceModeBreakdown from './components/SourceModeBreakdown.svelte';
  import TokenBreakdownPanel from './components/TokenBreakdownPanel.svelte';
  import SystemStatus from './components/SystemStatus.svelte';
  import Configuration from './components/Configuration.svelte';
  import AboutMetrics from './components/AboutMetrics.svelte';

  $: insights = $dashboardState ? deriveDashboardInsights($dashboardState) : null;
</script>

{#if insights}
  <div class="shell">
    <HeaderBar state={insights} />

    <main class="main-content">
      <section aria-label="Overview Hero" class="hero-region">
        <KpiStrip summary={insights.summary} pricing={insights.pricing} />
      </section>

      <div class="dashboard-grid">
        <section aria-label="Analysis Canvas" class="analysis-canvas">
          <ActivityHeatmap heatmap={insights.analytics.activityHeatmap} />
          <ModelUsage models={insights.analytics.modelUsage} />
        </section>

        <aside aria-label="Operations Rail" class="operations-rail">
          <TokenBreakdownPanel breakdown={insights.tokenBreakdown} />
        </aside>
      </div>

      <section aria-label="System Status & Coverage" class="bottom-cards">
        <SourceModeBreakdown coverage={insights.analytics.rpcCoverage} exportedInLastRun={insights.exportStatus.lastExportedCount} />
        <SystemStatus state={insights} />
        <Configuration state={insights} />
        <AboutMetrics />
      </section>

      <section aria-label="Session Deck" class="session-deck">
        <SessionLeaderboard sessions={insights.sortedSessions} />
      </section>
    </main>
  </div>
{:else}
  <div class="loading">Waiting for dashboard state...</div>
{/if}

<style>
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: transparent;
    animation: fade-in 220ms ease;
  }
  .main-content {
    padding: var(--spacing-lg) var(--spacing-xl) var(--spacing-xl);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    max-width: 1600px;
    margin: 0 auto;
    width: 100%;
  }
  .hero-region {
    width: 100%;
  }
  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: var(--spacing-lg);
    align-items: start;
  }
  .analysis-canvas {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }
  .bottom-cards {
    display: flex;
    gap: var(--spacing-md);
  }
  .operations-rail {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    position: sticky;
    top: var(--spacing-lg);
  }
  .session-deck {
    width: 100%;
    margin-top: var(--spacing-md);
  }
  .loading {
    padding: 42px 20px;
    text-align: center;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-size: 14px;
    letter-spacing: 0.02em;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (max-width: 1200px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
    .main-content {
      padding: var(--spacing-md) var(--spacing-md) var(--spacing-xl);
    }
    .operations-rail {
      position: static;
    }
  }
  @media (max-width: 800px) {
    .bottom-cards {
      flex-direction: column;
    }
  }
</style>
