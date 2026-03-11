<script lang="ts">
</script>

<aside class="insight-rail">
  <section class="rail-section">
    <h3 class="section-title">About Metrics</h3>

    <div class="info-card">
      <ul class="info-list">
        <li>
          <span class="highlight">Reported</span> usage comes from structured token fields in the session data.
        </li>
        <li>
          <span class="highlight">Estimated</span> usage is a fallback calculation based on text length when structured data is missing.
        </li>
        <li>
          Polling runs in the extension host to keep this dashboard lightweight.
        </li>
      </ul>
    </div>
  </section>
</aside>

<style>
  .insight-rail {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    background: var(--rail-bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--spacing-md);
    box-shadow: var(--shadow-elevated);
  }
  .rail-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .section-title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-family: var(--font-display);
  }

  .info-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--surface-line);
    border-radius: 8px;
    padding: var(--spacing-sm);
  }

  .info-list {
    margin: 0;
    padding: 0 0 0 var(--spacing-md);
    font-size: 11px;
    color: var(--muted);
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  .highlight {
    color: var(--text);
    font-weight: 500;
  }
</style>
