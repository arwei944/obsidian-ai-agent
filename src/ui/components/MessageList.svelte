<script lang="ts">
  import type { ChatMessage } from '../../types/message-types';
  import MessageItem from './MessageItem.svelte';

  export let messages: ChatMessage[];
  export let streamingText: string;
  export let thinkingText: string;
  export let showThinking: boolean;

  let container: HTMLElement;

  $: {
    if (container && (messages.length || streamingText)) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }
</script>

<div class="ai-message-list" bind:this={container}>
  {#if messages.length === 0 && !streamingText}
    <div class="ai-empty-state">
      <div class="ai-empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <p class="ai-empty-text">Ask me anything about your vault</p>
      <p class="ai-empty-hint">I can read, write, search, and manage your notes</p>
    </div>
  {/if}

  {#each messages as msg, i}
    <MessageItem message={msg} {showThinking} />
  {/each}

  {#if thinkingText && showThinking}
    <div class="ai-thinking-block">
      <div class="ai-thinking-label">Thinking...</div>
      <div class="ai-thinking-content">{thinkingText}</div>
    </div>
  {/if}

  {#if streamingText}
    <div class="ai-message ai-assistant">
      <div class="ai-message-content">
        {@html renderMarkdown(streamingText)}
      </div>
      <span class="ai-cursor">|</span>
    </div>
  {/if}
</div>

<script context="module" lang="ts">
  function renderMarkdown(text: string): string {
    // Basic markdown rendering for streaming
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  }
</script>
