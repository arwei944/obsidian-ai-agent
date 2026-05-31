<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let sessions: { id: string; title: string; updatedAt: number; messageCount: number }[];

  const dispatch = createEventDispatcher();

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
</script>

<div class="ai-session-list">
  <div class="ai-session-header">
    <span>Chat History</span>
    <button class="ai-icon-btn" on:click={() => dispatch('close')}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>

  {#if sessions.length === 0}
    <div class="ai-session-empty">No saved conversations</div>
  {:else}
    {#each sessions as session}
      <div class="ai-session-item" role="button" tabindex="0"
        on:click={() => dispatch('load', session.id)}
        on:keydown={(e) => e.key === 'Enter' && dispatch('load', session.id)}
      >
        <div class="ai-session-title">{session.title}</div>
        <div class="ai-session-meta">
          <span>{session.messageCount} messages</span>
          <span>{formatDate(session.updatedAt)}</span>
        </div>
        <button class="ai-session-delete" on:click|stopPropagation={() => dispatch('delete', session.id)} title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    {/each}
  {/if}
</div>
