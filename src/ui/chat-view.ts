import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type { App } from 'obsidian';
import type { ConversationManager, ConversationCallbacks } from '../core/conversation-manager';
import type { ConversationStore } from '../storage/conversation-store';
import type { ToolRegistry } from '../tools/tool-registry';
import type { PluginSettings } from '../types/settings-types';
import type { ChatMessage } from '../types/message-types';
import { createConversation } from '../types/message-types';

export const VIEW_TYPE_CHAT = 'obsidian-ai-agent-chat';

export class ChatView extends ItemView {
  private conversationManager: ConversationManager;
  private conversationStore: ConversationStore;
  private registry: ToolRegistry;
  private settings: PluginSettings;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private isStreaming = false;

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

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('ai-agent-chat-container');

    const header = container.createDiv({ cls: 'ai-chat-header' });
    header.createSpan({ text: 'AI 智能体', cls: 'ai-chat-title' });
    const actions = header.createDiv({ cls: 'ai-chat-actions' });
    this.createIconBtn(actions, '新建对话', '<path d="M12 5v14M5 12h14"/>', () => this.handleNewChat());
    this.createIconBtn(actions, '历史记录', '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>', () => this.handleShowSessions());

    this.messagesEl = container.createDiv({ cls: 'ai-chat-messages' });

    const inputBox = container.createDiv({ cls: 'ai-input-box' });
    this.inputEl = inputBox.createEl('textarea', {
      placeholder: '输入消息... (Shift+Enter 换行)',
      cls: 'ai-input-textarea',
    });
    this.inputEl.rows = 1;

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 150) + 'px';
    });

    const inputActions = inputBox.createDiv({ cls: 'ai-input-actions' });
    const sendBtn = inputActions.createEl('button', { cls: 'ai-send-btn', text: '发送' });
    sendBtn.addEventListener('click', () => this.handleSend());

    this.renderMessages();
  }

  async onClose(): Promise<void> {}

  private createIconBtn(parent: HTMLElement, title: string, pathD: string, onClick: () => void): void {
    const btn = parent.createEl('button', { cls: 'ai-icon-btn', attr: { title } });
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${pathD}</svg>`;
    btn.addEventListener('click', onClick);
  }

  private renderMessages(): void {
    this.messagesEl.empty();
    const conv = this.conversationManager.getConversation();

    if (conv.messages.length === 0) {
      const empty = this.messagesEl.createDiv({ cls: 'ai-empty-state' });
      empty.createEl('p', { text: '向我提问任何关于你的笔记库的问题', cls: 'ai-empty-text' });
      empty.createEl('p', { text: '我可以读取、编写、搜索和管理你的笔记', cls: 'ai-empty-hint' });
      return;
    }

    for (const msg of conv.messages) {
      if (msg.role === 'user' && msg.content.startsWith('[') && msg.content.includes('tool_result')) {
        continue; // 跳过内部工具结果消息
      }
      this.renderMessage(msg);
    }

    this.scrollToBottom();
  }

  private renderMessage(msg: ChatMessage): void {
    const el = this.messagesEl.createDiv({ cls: `ai-message ai-${msg.role}` });

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      const toolsEl = el.createDiv({ cls: 'ai-tool-calls' });
      for (const tc of msg.toolCalls) {
        const toolEl = toolsEl.createDiv({ cls: `ai-tool-call ${tc.isError ? 'error' : ''}` });
        toolEl.createSpan({ text: tc.name, cls: 'ai-tool-name' });
        toolEl.createSpan({ text: `${tc.duration}ms`, cls: 'ai-tool-duration' });
      }
    }

    el.createDiv({ cls: 'ai-message-content', text: msg.content });

    el.createDiv({
      cls: 'ai-message-time',
      text: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
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

  private async handleSend(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isStreaming) return;

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.isStreaming = true;
    this.renderMessages();

    const callbacks: ConversationCallbacks = {
      onTextDelta: () => this.renderMessages(),
      onThinkingDelta: () => {},
      onToolStart: () => this.renderMessages(),
      onToolEnd: () => {},
      onMessageComplete: () => this.renderMessages(),
      onError: (error) => {
        new Notice(`AI 错误: ${error.message}`);
        this.renderMessages();
      },
      onIterationStart: () => {},
      onConfirmationNeeded: async () => true,
    };

    await this.conversationManager.sendUserMessage(text, callbacks);
    this.isStreaming = false;
    this.renderMessages();
    await this.conversationStore.save(this.conversationManager.getConversation());
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
