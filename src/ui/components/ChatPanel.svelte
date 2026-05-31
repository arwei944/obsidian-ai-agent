<script lang="ts">
  import type { App } from 'obsidian';
  import type { ConversationManager, ConversationCallbacks } from '../../core/conversation-manager';
  import type { ConversationStore } from '../../storage/conversation-store';
  import type { ToolRegistry } from '../../tools/tool-registry';
  import type { PluginSettings } from '../../types/settings-types';
  import type { ChatMessage, Conversation } from '../../types/message-types';
  import { createConversation } from '../../types/message-types';
  import MessageList from './MessageList.svelte';
  import InputBox from './InputBox.svelte';
  import ToolStatus from './ToolStatus.svelte';
  import SessionList from './SessionList.svelte';

  export let app: App;
  export let conversationManager: ConversationManager;
  export let conversationStore: ConversationStore;
  export let registry: ToolRegistry;
  export let settings: PluginSettings;

  let messages: ChatMessage[] = [];
  let isStreaming = false;
  let streamingText = '';
  let currentTool = '';
  let showSessions = false;
  let sessions: { id: string; title: string; updatedAt: number; messageCount: number }[] = [];
  let iteration = 0;
  let thinkingText = '';
  let showThinking = false;

  $: conversation = conversationManager.getConversation();
  $: messages = conversation.messages;

  function scrollToBottom(el: HTMLElement) {
    el.scrollTop = el.scrollHeight;
  }

  async function handleSend(text: string) {
    if (!text.trim() || isStreaming) return;

    isStreaming = true;
    streamingText = '';
    thinkingText = '';
    currentTool = '';
    iteration = 0;

    const callbacks: ConversationCallbacks = {
      onTextDelta(delta) {
        streamingText += delta;
      },
      onThinkingDelta(delta) {
        thinkingText += delta;
      },
      onToolStart(name, _input) {
        currentTool = name;
      },
      onToolEnd(name, result, isError, duration) {
        currentTool = '';
      },
      onMessageComplete(msg) {
        streamingText = '';
        thinkingText = '';
      },
      onError(error) {
        streamingText = '';
        thinkingText = '';
        currentTool = '';
      },
      onIterationStart(iter) {
        iteration = iter;
      },
      onConfirmationNeeded: async (toolName, input) => {
        return true; // TODO: show confirmation modal
      },
    };

    await conversationManager.sendUserMessage(text, callbacks);

    isStreaming = false;
    streamingText = '';
    thinkingText = '';
    currentTool = '';
    messages = [...conversationManager.getConversation().messages];

    // Auto-save
    await conversationStore.save(conversationManager.getConversation());
  }

  async function handleNewChat() {
    conversationManager.setConversation(createConversation());
    messages = [];
    streamingText = '';
    thinkingText = '';
    showSessions = false;
  }

  async function handleShowSessions() {
    sessions = await conversationStore.getList();
    showSessions = !showSessions;
  }

  async function handleLoadSession(id: string) {
    const conv = await conversationStore.load(id);
    if (conv) {
      conversationManager.setConversation(conv);
      messages = conv.messages;
    }
    showSessions = false;
  }

  async function handleDeleteSession(id: string) {
    await conversationStore.delete(id);
    sessions = await conversationStore.getList();
  }

  function handleStop() {
    conversationManager.abort();
    isStreaming = false;
  }
</script>

<div class="ai-chat-panel">
  <div class="ai-chat-header">
    <span class="ai-chat-title">AI Agent</span>
    <div class="ai-chat-actions">
      <button class="ai-icon-btn" on:click={handleNewChat} title="New Chat">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      <button class="ai-icon-btn" on:click={handleShowSessions} title="History">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
      </button>
    </div>
  </div>

  {#if showSessions}
    <SessionList
      {sessions}
      on:load={(e) => handleLoadSession(e.detail)}
      on:delete={(e) => handleDeleteSession(e.detail)}
      on:close={() => showSessions = false}
    />
  {:else}
    <div class="ai-chat-messages" use:scrollToBottom={messages.length}>
      <MessageList {messages} {streamingText} {thinkingText} {showThinking} />
    </div>

    {#if currentTool}
      <ToolStatus toolName={currentTool} {iteration} />
    {/if}

    <InputBox
      {isStreaming}
      on:send={(e) => handleSend(e.detail)}
      on:stop={handleStop}
    />
  {/if}
</div>
