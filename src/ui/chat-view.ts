import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type { App } from 'obsidian';
import type { ConversationManager, ConversationCallbacks } from '../core/conversation-manager';
import type { ConversationStore } from '../storage/conversation-store';
import type { ToolRegistry } from '../tools/tool-registry';
import type { PluginSettings } from '../types/settings-types';
import type { ChatMessage } from '../types/message-types';
import { createConversation } from '../types/message-types';

export const VIEW_TYPE_CHAT = 'obsidian-ai-agent-chat';

const AVATAR_AI = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>`;
const AVATAR_USER = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="ai-code-block"><code>${code.trim()}</code></pre>`);
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
  // bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // headers
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // horizontal rule
  html = html.replace(/^---$/gm, '<hr/>');
  // blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // unordered list
  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  // ordered list
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2"/>');
  // newlines
  html = html.replace(/\n/g, '<br/>');
  return html;
}

export class ChatView extends ItemView {
  private conversationManager: ConversationManager;
  private conversationStore: ConversationStore;
  private registry: ToolRegistry;
  private settings: PluginSettings;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private isStreaming = false;
  private streamingContentEl: HTMLElement | null = null;
  private streamingThinkingEl: HTMLElement | null = null;
  private streamingThinkingContentEl: HTMLElement | null = null;
  private streamingToolCallsEl: HTMLElement | null = null;
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
    const sendBtn = inputWrapper.createEl('button', { cls: 'ai-send-btn', attr: { title: '发送' } });
    sendBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
    sendBtn.addEventListener('click', () => this.handleSend());

    this.renderMessages();
  }

  async onClose(): Promise<void> {}

  private createIconBtn(parent: HTMLElement, title: string, pathD: string, onClick: () => void): void {
    const btn = parent.createEl('button', { cls: 'ai-icon-btn', attr: { title } });
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${pathD}</svg>`;
    btn.addEventListener('click', onClick);
  }

  // ── 渲染已有消息 ──
  private renderMessages(): void {
    this.messagesEl.empty();
    const conv = this.conversationManager.getConversation();
    if (conv.messages.length === 0) {
      this.renderEmptyState();
      return;
    }
    for (const msg of conv.messages) {
      if (msg.role === 'user' && msg.content.startsWith('[') && msg.content.includes('tool_result')) continue;
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
    const row = this.messagesEl.createDiv({ cls: `ai-msg-row ai-msg-row-${msg.role}` });

    // Avatar
    const avatar = row.createDiv({ cls: 'ai-msg-avatar' });
    avatar.innerHTML = isUser ? AVATAR_USER : AVATAR_AI;

    // Bubble
    const bubble = row.createDiv({ cls: 'ai-msg-bubble' });
    const nameEl = bubble.createDiv({ cls: 'ai-msg-name' });
    nameEl.textContent = isUser ? '你' : 'AI 智能体';

    // Tool calls
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      const toolsEl = bubble.createDiv({ cls: 'ai-msg-tools' });
      for (const tc of msg.toolCalls) {
        const toolEl = toolsEl.createDiv({ cls: `ai-msg-tool-badge ${tc.isError ? 'error' : ''}` });
        toolEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
        toolEl.createSpan({ text: tc.name });
        toolEl.createSpan({ cls: 'ai-tool-dur', text: `${tc.duration}ms` });
        if (tc.isError) toolEl.createSpan({ cls: 'ai-tool-err', text: '失败' });
      }
    }

    // Content
    const contentEl = bubble.createDiv({ cls: 'ai-msg-content' });
    if (isUser) {
      contentEl.textContent = msg.content;
    } else {
      contentEl.innerHTML = renderMarkdown(msg.content);
    }

    // Time
    const timeEl = bubble.createDiv({ cls: 'ai-msg-time' });
    timeEl.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── 流式输出：创建占位消息 ──
  private createStreamingMessage(): void {
    const row = this.messagesEl.createDiv({ cls: 'ai-msg-row ai-msg-row-assistant' });
    row.id = 'ai-streaming-row';

    const avatar = row.createDiv({ cls: 'ai-msg-avatar' });
    avatar.innerHTML = AVATAR_AI;

    const bubble = row.createDiv({ cls: 'ai-msg-bubble' });
    bubble.createDiv({ cls: 'ai-msg-name', text: 'AI 智能体' });

    // Thinking
    this.streamingThinkingEl = bubble.createDiv({ cls: 'ai-msg-thinking-wrap ai-thinking-expanded' });
    const thinkingHeader = this.streamingThinkingEl.createDiv({ cls: 'ai-thinking-header' });
    const thinkingIcon = thinkingHeader.createSpan({ cls: 'ai-thinking-icon' });
    thinkingIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;
    const thinkingLabel = thinkingHeader.createSpan({ text: '思考中...' });
    thinkingLabel.addClass('ai-thinking-label');
    // 折叠按钮
    const toggleBtn = thinkingHeader.createSpan({ cls: 'ai-thinking-toggle' });
    toggleBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
    thinkingHeader.addEventListener('click', () => {
      this.streamingThinkingEl?.toggleClass('ai-thinking-expanded');
    });
    this.streamingThinkingContentEl = this.streamingThinkingEl.createDiv({ cls: 'ai-thinking-content' });

    // Tool calls
    this.streamingToolCallsEl = bubble.createDiv({ cls: 'ai-msg-tools' });

    // Text content
    this.streamingContentEl = bubble.createDiv({ cls: 'ai-msg-content' });

    const timeEl = bubble.createDiv({ cls: 'ai-msg-time' });
    timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── 发送消息 ──
  private async handleSend(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isStreaming) return;

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.isStreaming = true;
    this.streamBuffer = '';
    this.thinkingBuffer = '';

    // 先渲染已有消息
    this.renderMessages();
    // 创建流式消息占位
    this.createStreamingMessage();
    this.scrollToBottom();

    const callbacks: ConversationCallbacks = {
      onTextDelta: (delta) => {
        // 首次收到文本时，自动折叠思考过程
        if (this.streamBuffer === '' && this.thinkingBuffer && this.streamingThinkingEl) {
          this.streamingThinkingEl.removeClass('ai-thinking-expanded');
          const label = this.streamingThinkingEl.querySelector('.ai-thinking-label');
          if (label) label.textContent = '思考过程';
        }
        this.streamBuffer += delta;
        if (this.streamingContentEl) {
          this.streamingContentEl.innerHTML = renderMarkdown(this.streamBuffer);
        }
        this.scrollToBottom();
      },
      onThinkingDelta: (delta) => {
        this.thinkingBuffer += delta;
        if (this.streamingThinkingEl && this.streamingThinkingContentEl) {
          this.streamingThinkingEl.style.display = 'block';
          this.streamingThinkingContentEl.textContent = this.thinkingBuffer;
          // 自动滚动思考内容到底部
          this.streamingThinkingContentEl.scrollTop = this.streamingThinkingContentEl.scrollHeight;
        }
        this.scrollToBottom();
      },
      onToolStart: (name, _input) => {
        if (this.streamingToolCallsEl) {
          const badge = this.streamingToolCallsEl.createDiv({ cls: 'ai-msg-tool-badge running' });
          badge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
          badge.createSpan({ text: name });
          const spinner = badge.createDiv({ cls: 'ai-tool-spinner' });
        }
        this.scrollToBottom();
      },
      onToolEnd: (_name, _result, _isError, _duration) => {},
      onMessageComplete: () => {
        this.streamingContentEl = null;
        this.streamingThinkingEl = null;
        this.streamingThinkingContentEl = null;
        this.streamingToolCallsEl = null;
      },
      onError: (error) => {
        new Notice(`AI 错误: ${error.message}`);
        this.streamingContentEl = null;
        this.streamingThinkingEl = null;
        this.streamingThinkingContentEl = null;
        this.streamingToolCallsEl = null;
      },
      onIterationStart: () => {},
      onConfirmationNeeded: async () => true,
    };

    await this.conversationManager.sendUserMessage(text, callbacks);
    this.isStreaming = false;
    this.renderMessages();
    await this.conversationStore.save(this.conversationManager.getConversation());
  }

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
