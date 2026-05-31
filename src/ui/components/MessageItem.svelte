<script lang="ts">
  import type { ChatMessage } from '../../types/message-types';

  export let message: ChatMessage;
  export let showThinking: boolean;

  function renderContent(content: string): string {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="ai-message ai-{message.role}">
  {#if message.role === 'assistant' && message.thinking && showThinking}
    <details class="ai-thinking-details">
      <summary>Thinking</summary>
      <div class="ai-thinking-content">{message.thinking}</div>
    </details>
  {/if}

  <div class="ai-message-content">
    {@html renderContent(message.content)}
  </div>

  {#if message.toolCalls && message.toolCalls.length > 0}
    <div class="ai-tool-calls">
      {#each message.toolCalls as tc}
        <div class="ai-tool-call" class:error={tc.isError}>
          <span class="ai-tool-name">{tc.name}</span>
          <span class="ai-tool-duration">{tc.duration}ms</span>
          {#if tc.isError}
            <span class="ai-tool-error">Error</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="ai-message-time">{formatTime(message.timestamp)}</div>
</div>
