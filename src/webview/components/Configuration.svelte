<script lang="ts">
  import type { DashboardState } from '../../types';

  export let state: DashboardState;
</script>

<article class="analytical-card">
  <div class="card-header">
    <h2 class="section-title">插件配置</h2>
    <div class="card-meta">工作区配置详情</div>
  </div>

  <div class="card-body">
    <div class="config-card">
      <div class="config-item">
        <div class="config-label">会话根目录</div>
        <div class="config-value mono" title={state.rootPath}>{state.rootPath}</div>
      </div>

      <div class="config-item">
        <div class="config-label">RPC 导出</div>
        <div class="config-value">{state.config.useRpcExport ? '已启用' : '已禁用'}</div>
      </div>

      <div class="config-item">
        <div class="config-label">步骤文本导出</div>
        <div class="config-value">{state.config.exportStepsJsonl ? '已启用' : '已禁用'}</div>
      </div>
    </div>

    {#if !state.config.exportStepsJsonl}
      <div class="info-card" role="status" aria-live="polite">
        <div class="info-title">步骤导出：仅元数据</div>
        <div class="info-copy">
          当前已关闭步骤正文导出，仅保留脱敏元数据（角色、时间戳、模型、工具名）。开启 <code>exportStepsJsonl</code> 后才会写入完整对话文本。
        </div>
      </div>
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

  .config-card {
    background: var(--surface-subtle);
    border: 1px solid var(--surface-line);
    border-radius: 8px;
    padding: var(--spacing-sm);
  }

  .config-item {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-sm);
  }
  .config-item:last-child {
    margin-bottom: 0;
  }
  .config-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .config-value {
    font-size: 10px;
    color: var(--text);
    background: var(--surface-muted);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: 4px;
    border: 1px solid var(--surface-line);
    word-break: break-all;
  }
  .mono {
    font-family: var(--code-font);
  }
  .info-card {
    border: 1px solid var(--accent-border);
    background: var(--accent-soft);
    border-radius: 8px;
    padding: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  .info-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .info-copy {
    font-size: 11px;
    line-height: 1.5;
    color: var(--text);
    word-break: break-word;
  }
</style>
