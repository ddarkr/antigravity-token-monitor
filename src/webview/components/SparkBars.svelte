<script lang="ts">
  export let series: number[];

  $: points = series.length > 0 ? series : [0];
  $: maxValue = Math.max(...points, 1);
  $: bars = points.map(value => Math.max(8, Math.round((value / maxValue) * 28)));
</script>

<div class="sparkline">
  {#each bars as height}
    <span style="height: {height}px"></span>
  {/each}
</div>

<style>
  .sparkline {
    display: flex;
    gap: 4px;
    align-items: end;
    height: 28px;
  }
  .sparkline span {
    flex: 1;
    min-width: 4px;
    background: var(--accent);
    border-radius: 999px 999px 3px 3px;
    opacity: 0.8;
  }
</style>
