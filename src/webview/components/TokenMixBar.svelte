<script lang="ts">
  export let inputTokens: number;
  export let outputTokens: number;
  export let totalTokens: number;

  $: inputPercent = totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 0;
  $: outputPercent = totalTokens > 0 ? (outputTokens / totalTokens) * 100 : 0;
</script>

<div class="mix-bar">
  <div class="segment input" style="width: {inputPercent}%" title="Input: {inputTokens}"></div>
  <div class="segment output" style="width: {outputPercent}%" title="Output: {outputTokens}"></div>
</div>

<style>
  .mix-bar {
    display: flex;
    height: 6px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255,255,255,0.05);
    width: 100%;
    box-shadow: inset 0 0 0 1px var(--surface-line);
  }
  .segment {
    height: 100%;
  }
  .input {
    background: var(--accent);
  }
  .output {
    background: var(--warm);
  }
</style>
