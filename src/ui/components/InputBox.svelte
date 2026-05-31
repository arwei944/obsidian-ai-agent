<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let isStreaming: boolean;

  const dispatch = createEventDispatcher();

  let text = '';
  let textareaEl: HTMLTextAreaElement;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    if (!text.trim() || isStreaming) return;
    dispatch('send', text.trim());
    text = '';
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
  }

  function handleInput() {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 150) + 'px';
    }
  }
</script>

<div class="ai-input-box">
  <textarea
    bind:this={textareaEl}
    bind:value={text}
    on:keydown={handleKeydown}
    on:input={handleInput}
    placeholder="Ask me anything... (Shift+Enter for newline)"
    disabled={isStreaming}
    rows="1"
  ></textarea>
  <div class="ai-input-actions">
    {#if isStreaming}
      <button class="ai-stop-btn" on:click={() => dispatch('stop')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        Stop
      </button>
    {:else}
      <button class="ai-send-btn" on:click={handleSend} disabled={!text.trim()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
      </button>
    {/if}
  </div>
</div>
