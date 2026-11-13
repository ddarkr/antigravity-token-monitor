<script lang="ts">
</script>

<article class="analytical-card">
  <div class="card-header">
    <h2 class="section-title">指标说明</h2>
    <div class="card-meta">数据采集方式</div>
  </div>

  <div class="card-body">
    <div class="info-card">
      <ul class="info-list">
        <li>
          <span class="highlight">Reported</span>：直接读取会话及 RPC 产物中的结构化 Token 字段。
        </li>
        <li>
          <span class="highlight">Estimated</span>：当缺少结构化记录时，依据文本长度自动估算。
        </li>
        <li>
          扩展宿主后台异步轮询采集，保持仪表盘界面轻量流畅。
        </li>
      </ul>
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
    background: var(--surface-subtle);
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
    flex: 1;
  }

  .info-card {
    background: var(--surface-subtle);
    border: 1px solid var(--surface-line);
    border-radius: 8px;
    padding: var(--spacing-sm);
    flex: 1;
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
