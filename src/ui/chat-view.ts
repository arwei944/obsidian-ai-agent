import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type { App } from 'obsidian';
import type { ConversationManager, ConversationCallbacks } from '../core/conversation-manager';
import type { ConversationStore } from '../storage/conversation-store';
import type { ToolRegistry } from '../tools/tool-registry';
import type { PluginSettings } from '../types/settings-types';
import type { ChatMessage } from '../types/message-types';
import { createConversation } from '../types/message-types';

export const VIEW_TYPE_CHAT = 'obsidian-ai-agent-chat';

const AVATAR_AI = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>`;
const AVATAR_USER = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="ai-code-block"><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^---$/gm, '<hr/>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => {
    if (!match.startsWith('<ul>') && !match.startsWith('<ol>')) return `<ul>${match}</ul>`;
    return match;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2"/>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export class ChatView extends ItemView {
  private conversationManager: ConversationManager;
  private conversationStore: ConversationStore;
  private registry: ToolRegistry;
  private settings: PluginSettings;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtnEl!: HTMLButtonElement;
  private isStreaming = false;

  // Streaming state
  private streamContainerEl: HTMLElement | null = null;
  private streamThinkingEl: HTMLElement | null = null;
  private streamThinkingContentEl: HTMLElement | null = null;
  private streamThinkingTimer: ReturnType<typeof setInterval> | null = null;
  private streamThinkingSeconds = 0;
  private streamToolCallsEl: HTMLElement | null = null;
  private streamContentEl: HTMLElement | null = null;
  private streamActionsEl: HTMLElement | null = null;
  private streamBuffer = '';
  private thinkingBuffer = '';

  constructor(
    leaf: WorkspaceLeaf,
    app: App,
    conversationManager: ConversationManager,
    conversationStore: ConversationStore,
    registry: ToolRegistry,
    settings: PluginSettings
  ) {
    super(leaf);
    this.app = app;
    this.conversationManager = conversationManager;
    this.conversationStore = conversationStore;
    this.registry = registry;
    this.settings = settings;
  }

  getViewType(): string { return VIEW_TYPE_CHAT; }
  getDisplayText(): string { return 'AI 智能体'; }
  getIcon(): string { return 'bot'; }

  updateSettings(settings: PluginSettings): void { this.settings = settings; }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('ai-chat-container');

    // ── Header ──
    const header = container.createDiv({ cls: 'ai-chat-header' });
    const titleRow = header.createDiv({ cls: 'ai-chat-title-row' });
    titleRow.createSpan({ text: 'AI 智能体', cls: 'ai-chat-title' });
    titleRow.createDiv({ cls: 'ai-chat-status' }).createSpan({ text: '在线' });
    const actions = header.createDiv({ cls: 'ai-chat-actions' });
    this.createIconBtn(actions, '新建对话', '<path d="M12 5v14M5 12h14"/>', () => this.handleNewChat());
    this.createIconBtn(actions, '历史记录', '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>', () => this.handleShowSessions());

    // ── Messages ──
    this.messagesEl = container.createDiv({ cls: 'ai-chat-messages' });

    // ── Input ──
    const inputBox = container.createDiv({ cls: 'ai-input-box' });
    const inputWrapper = inputBox.createDiv({ cls: 'ai-input-wrapper' });
    this.inputEl = inputWrapper.createEl('textarea', {
      placeholder: '输入消息... (Shift+Enter 换行)',
      cls: 'ai-input-textarea',
    });
    this.inputEl.rows = 1;
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.handleSend(); }
    });
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
    });
    this.sendBtnEl = inputWrapper.createEl('button', { cls: 'ai-send-btn', attr: { title: '发送' } });
    this.sendBtnEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
    this.sendBtnEl.addEventListener('click', () => {
      if (this.isStreaming) {
        this.handleStop();
      } else {
        this.handleSend();
      }
    });

    this.renderMessages();
  }

  async onClose(): Promise<void> {
    if (this.streamThinkingTimer) clearInterval(this.streamThinkingTimer);
  }

  private createIconBtn(parent: HTMLElement, title: string, pathD: string, onClick: () => void): void {
    const btn = parent.createEl('button', { cls: 'ai-icon-btn', attr: { title } });
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${pathD}</svg>`;
    btn.addEventListener('click', onClick);
  }

  // ══════════════════════════════════════════
  //  Message Rendering
  // ══════════════════════════════════════════

  private renderMessages(): void {
    this.messagesEl.empty();
    const conv = this.conversationManager.getConversation();
    if (conv.messages.length === 0) {
      this.renderEmptyState();
      return;
    }
    for (const msg of conv.messages) {
      this.renderMessage(msg);
    }
    this.scrollToBottom();
  }

  private renderEmptyState(): void {
    const empty = this.messagesEl.createDiv({ cls: 'ai-empty-state' });
    const icon = empty.createDiv({ cls: 'ai-empty-icon' });
    icon.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>`;
    empty.createEl('p', { text: '向我提问任何关于你的笔记库的问题', cls: 'ai-empty-text' });
    empty.createEl('p', { text: '我可以读取、编写、搜索和管理你的笔记', cls: 'ai-empty-hint' });
  }

  private renderMessage(msg: ChatMessage): void {
    const isUser = msg.role === 'user';

    // Root wrapper (full width)
    const root = this.messagesEl.createDiv({ cls: 'ai-msg-root' });

    // Message card (group for hover effects)
    const card = root.createDiv({ cls: 'ai-msg-card ai-msg-card-' + msg.role });
    if (isUser) {
      card.style.backgroundColor = 'var(--background-modifier-hover)';
    }

    // Inner column
    const inner = card.createDiv({ cls: 'ai-msg-inner' });

    // Header row: avatar + name + time
    const headerRow = inner.createDiv({ cls: 'ai-msg-header' });
    const avatarEl = headerRow.createDiv({ cls: 'ai-msg-avatar' });
    avatarEl.innerHTML = isUser ? AVATAR_USER : AVATAR_AI;
    headerRow.createSpan({ cls: 'ai-msg-name', text: isUser ? '你' : 'AI 智能体' });
    headerRow.createSpan({ cls: 'ai-msg-time', text: formatTimestamp(msg.timestamp) });

    // Tool calls
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        this.renderToolCallBanner(inner, tc.name, tc.isError, tc.duration);
      }
    }

    // Content
    const contentEl = inner.createDiv({ cls: 'ai-msg-content' });
    if (isUser) {
      contentEl.textContent = msg.content;
    } else {
      contentEl.innerHTML = renderMarkdown(msg.content);
    }

    // Action buttons (on hover, AI only)
    if (!isUser) {
      const actionsRow = inner.createDiv({ cls: 'ai-msg-actions' });
      this.createActionBtn(actionsRow, '复制', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', () => {
        navigator.clipboard.writeText(msg.content);
        new Notice('已复制到剪贴板');
      });
    }
  }

  private createActionBtn(parent: HTMLElement, title: string, pathD: string, onClick: () => void): void {
    const btn = parent.createEl('button', { cls: 'ai-action-btn', attr: { title } });
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${pathD}</svg>`;
    btn.addEventListener('click', onClick);
  }

  private renderToolCallBanner(parent: HTMLElement, name: string, isError: boolean, duration: number): void {
    const banner = parent.createDiv({ cls: 'ai-tool-banner' });
    const header = banner.createDiv({ cls: 'ai-tool-banner-header' });

    const left = header.createDiv({ cls: 'ai-tool-banner-left' });
    left.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
    left.createSpan({ text: name });

    const right = header.createDiv({ cls: 'ai-tool-banner-right' });
    if (isError) {
      right.createSpan({ cls: 'ai-tool-banner-error', text: '失败' });
    } else {
      right.createSpan({ cls: 'ai-tool-banner-duration', text: `${duration}ms` });
    }
  }

  // ══════════════════════════════════════════
  //  Streaming Message
  // ══════════════════════════════════════════

  private createStreamingMessage(): void {
    const root = this.messagesEl.createDiv({ cls: 'ai-msg-root' });
    root.id = 'ai-streaming-root';

    const card = root.createDiv({ cls: 'ai-msg-card ai-msg-card-assistant' });
    const inner = card.createDiv({ cls: 'ai-msg-inner' });

    // Header
    const headerRow = inner.createDiv({ cls: 'ai-msg-header' });
    const avatarEl = headerRow.createDiv({ cls: 'ai-msg-avatar' });
    avatarEl.innerHTML = AVATAR_AI;
    headerRow.createSpan({ cls: 'ai-msg-name', text: 'AI 智能体' });
    headerRow.createSpan({ cls: 'ai-msg-time', text: formatTimestamp(Date.now()) });

    // Thinking block
    this.streamThinkingEl = inner.createDiv({ cls: 'ai-reasoning-block ai-reasoning-active' });
    const thinkingHeader = this.streamThinkingEl.createDiv({ cls: 'ai-reasoning-header' });
    // Spinner icon
    const iconEl = thinkingHeader.createSpan({ cls: 'ai-reasoning-icon' });
    iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ai-spin-icon"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
    thinkingHeader.createSpan({ cls: 'ai-reasoning-label', text: '思考中...' });
    // Timer
    const timerEl = thinkingHeader.createSpan({ cls: 'ai-reasoning-timer' });
    timerEl.textContent = '0s';
    this.streamThinkingSeconds = 0;
    this.streamThinkingTimer = setInterval(() => {
      this.streamThinkingSeconds++;
      timerEl.textContent = `${this.streamThinkingSeconds}s`;
    }, 1000);

    // Thinking content
    this.streamThinkingContentEl = this.streamThinkingEl.createDiv({ cls: 'ai-reasoning-content' });

    // Tool calls container
    this.streamToolCallsEl = inner.createDiv({ cls: 'ai-stream-tools' });

    // Text content
    this.streamContentEl = inner.createDiv({ cls: 'ai-msg-content' });

    // Actions row (hidden during streaming)
    this.streamActionsEl = inner.createDiv({ cls: 'ai-msg-actions ai-msg-actions-hidden' });
    this.createActionBtn(this.streamActionsEl, '复制', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', () => {
      if (this.streamBuffer) {
        navigator.clipboard.writeText(this.streamBuffer);
        new Notice('已复制到剪贴板');
      }
    });

    this.scrollToBottom();
  }

  private finishStreaming(): void {
    if (this.streamThinkingTimer) {
      clearInterval(this.streamThinkingTimer);
      this.streamThinkingTimer = null;
    }
    // Finalize thinking block
    if (this.streamThinkingEl) {
      this.streamThinkingEl.removeClass('ai-reasoning-active');
      this.streamThinkingEl.addClass('ai-reasoning-done');
      const label = this.streamThinkingEl.querySelector('.ai-reasoning-label');
      if (label) label.textContent = `思考 ${this.streamThinkingSeconds}s`;
      const icon = this.streamThinkingEl.querySelector('.ai-reasoning-icon');
      if (icon) icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
    }
    // Show action buttons
    if (this.streamActionsEl) {
      this.streamActionsEl.removeClass('ai-msg-actions-hidden');
    }
    // Clear refs
    this.streamContentEl = null;
    this.streamThinkingEl = null;
    this.streamThinkingContentEl = null;
    this.streamToolCallsEl = null;
    this.streamActionsEl = null;
  }

  // ══════════════════════════════════════════
  //  Sending
  // ══════════════════════════════════════════

  private async handleSend(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isStreaming) return;

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.isStreaming = true;
    this.streamBuffer = '';
    this.thinkingBuffer = '';
    this.updateSendButton();

    // Render existing messages + new user message immediately
    this.renderMessages();
    this.renderUserMessage(text);

    const callbacks: ConversationCallbacks = {
      onTextDelta: (delta) => {
        // First text delta: create streaming message if not created, collapse thinking
        if (this.streamBuffer === '' && !document.getElementById('ai-streaming-root')) {
          this.createStreamingMessage();
          this.collapseThinking();
        }
        this.streamBuffer += delta;
        if (this.streamContentEl) {
          this.streamContentEl.innerHTML = renderMarkdown(this.streamBuffer);
        }
        this.scrollToBottom();
      },
      onThinkingDelta: (delta) => {
        // First thinking delta: create streaming message
        if (!document.getElementById('ai-streaming-root')) {
          this.createStreamingMessage();
        }
        this.thinkingBuffer += delta;
        if (this.streamThinkingContentEl) {
          this.streamThinkingContentEl.textContent = this.thinkingBuffer;
          this.streamThinkingContentEl.scrollTop = this.streamThinkingContentEl.scrollHeight;
        }
        this.scrollToBottom();
      },
      onToolStart: (name, _input) => {
        if (!document.getElementById('ai-streaming-root')) {
          this.createStreamingMessage();
          this.collapseThinking();
        }
        if (this.streamToolCallsEl) {
          const banner = this.streamToolCallsEl.createDiv({ cls: 'ai-tool-banner ai-tool-banner-active' });
          banner.id = `ai-tool-active-${name}-${Date.now()}`;
          const header = banner.createDiv({ cls: 'ai-tool-banner-header' });
          const left = header.createDiv({ cls: 'ai-tool-banner-left' });
          left.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
          left.createSpan({ text: name + '...' });
          header.createDiv({ cls: 'ai-tool-spinner' });
        }
        this.scrollToBottom();
      },
      onToolEnd: (name, _result, isError, duration) => {
        // Replace active banner with completed banner
        const activeBanner = this.streamToolCallsEl?.querySelector('.ai-tool-banner-active');
        if (activeBanner) {
          activeBanner.remove();
        }
        if (this.streamToolCallsEl) {
          this.renderToolCallBanner(this.streamToolCallsEl, name, isError, duration);
        }
      },
      onMessageComplete: () => {
        this.finishStreaming();
      },
      onError: (error) => {
        new Notice(`AI 错误: ${error.message}`);
        if (this.streamThinkingTimer) clearInterval(this.streamThinkingTimer);
        this.finishStreaming();
      },
      onIterationStart: () => {},
      onConfirmationNeeded: async () => true,
    };

    await this.conversationManager.sendUserMessage(text, callbacks);
    this.isStreaming = false;
    this.updateSendButton();
    this.renderMessages();
    await this.conversationStore.save(this.conversationManager.getConversation());
  }

  private renderUserMessage(text: string): void {
    const root = this.messagesEl.createDiv({ cls: 'ai-msg-root' });
    const card = root.createDiv({ cls: 'ai-msg-card ai-msg-card-user' });
    card.style.backgroundColor = 'var(--background-modifier-hover)';
    const inner = card.createDiv({ cls: 'ai-msg-inner' });
    const headerRow = inner.createDiv({ cls: 'ai-msg-header' });
    const avatarEl = headerRow.createDiv({ cls: 'ai-msg-avatar' });
    avatarEl.innerHTML = AVATAR_USER;
    headerRow.createSpan({ cls: 'ai-msg-name', text: '你' });
    headerRow.createSpan({ cls: 'ai-msg-time', text: formatTimestamp(Date.now()) });
    const contentEl = inner.createDiv({ cls: 'ai-msg-content' });
    contentEl.textContent = text;
    this.scrollToBottom();
  }

  private collapseThinking(): void {
    if (this.streamThinkingEl && this.thinkingBuffer) {
      this.streamThinkingEl.removeClass('ai-reasoning-active');
      this.streamThinkingEl.addClass('ai-reasoning-done');
      const label = this.streamThinkingEl.querySelector('.ai-reasoning-label');
      if (label) label.textContent = `思考 ${this.streamThinkingSeconds}s`;
      const icon = this.streamThinkingEl.querySelector('.ai-reasoning-icon');
      if (icon) icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
      if (this.streamThinkingTimer) {
        clearInterval(this.streamThinkingTimer);
        this.streamThinkingTimer = null;
      }
    }
  }

  private handleStop(): void {
    // Abort is handled by conversationManager
    this.isStreaming = false;
    this.updateSendButton();
    this.finishStreaming();
    this.renderMessages();
  }

  private updateSendButton(): void {
    if (!this.sendBtnEl) return;
    if (this.isStreaming) {
      this.sendBtnEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
      this.sendBtnEl.title = '停止';
      this.sendBtnEl.addClass('ai-send-btn-stop');
    } else {
      this.sendBtnEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
      this.sendBtnEl.title = '发送';
      this.sendBtnEl.removeClass('ai-send-btn-stop');
    }
  }

  // ══════════════════════════════════════════
  //  Navigation
  // ══════════════════════════════════════════

  private handleNewChat(): void {
    this.conversationManager.setConversation(createConversation());
    this.renderMessages();
  }

  private async handleShowSessions(): Promise<void> {
    const sessions = await this.conversationStore.getList();
    this.messagesEl.empty();
    const header = this.messagesEl.createDiv({ cls: 'ai-session-header' });
    header.createSpan({ text: '历史记录' });
    const closeBtn = header.createEl('button', { cls: 'ai-icon-btn', text: '✕' });
    closeBtn.addEventListener('click', () => this.renderMessages());
    if (sessions.length === 0) {
      this.messagesEl.createDiv({ text: '暂无历史对话', cls: 'ai-session-empty' });
      return;
    }
    for (const session of sessions) {
      const item = this.messagesEl.createDiv({ cls: 'ai-session-item', attr: { tabindex: '0' } });
      item.createDiv({ text: session.title, cls: 'ai-session-title' });
      item.createDiv({ text: `${session.messageCount} 条消息`, cls: 'ai-session-meta' });
      item.addEventListener('click', async () => {
        const conv = await this.conversationStore.load(session.id);
        if (conv) {
          this.conversationManager.setConversation(conv);
          this.renderMessages();
        }
      });
    }
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }
}
