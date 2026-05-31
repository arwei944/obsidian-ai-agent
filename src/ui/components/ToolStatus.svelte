<script lang="ts">
  export let toolName: string;
  export let iteration: number;
</script>

<div class="ai-tool-status">
  <div class="ai-tool-spinner"></div>
  <span class="ai-tool-label">Running: <strong>{toolName}</strong></span>
  {#if iteration > 1}
    <span class="ai-iteration">Step {iteration}</span>
  {/if}
</div>
