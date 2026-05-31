import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import type { PluginSettings } from './src/types/settings-types';
import { DEFAULT_SETTINGS } from './src/types/settings-types';
import { createConversation } from './src/types/message-types';
import { ToolRegistry } from './src/tools/tool-registry';
import { ConversationManager } from './src/core/conversation-manager';
import { ConversationStore } from './src/storage/conversation-store';
import { SettingsStore } from './src/storage/settings-store';
import { ChatView, VIEW_TYPE_CHAT } from './src/ui/chat-view';
import { AIAgentSettingTab } from './src/ui/settings-tab';
import { createFileTools } from './src/tools/file-tools';
import { createMetadataTools } from './src/tools/metadata-tools';
import { createSearchTools } from './src/tools/search-tools';
import { createEditorTools } from './src/tools/editor-tools';
import { createWorkspaceTools } from './src/tools/workspace-tools';
import { createNoteTools } from './src/tools/note-tools';
import { createCommandTools } from './src/tools/command-tools';
import { createSystemTools } from './src/tools/system-tools';

export default class ObsidianAIAgentPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  private registry: ToolRegistry = new ToolRegistry();
  private conversationManager!: ConversationManager;
  private conversationStore!: ConversationStore;
  private settingsStore!: SettingsStore;
  private chatView: ChatView | null = null;

  async onload(): Promise<void> {
    // Load settings — loadData/saveData are Plugin methods, not App methods
    this.settingsStore = new SettingsStore(this);
    this.settings = await this.settingsStore.load();

    // Initialize stores
    this.conversationStore = new ConversationStore(this);

    // Register all tools
    this.registerTools();

    // Initialize conversation manager
    this.conversationManager = new ConversationManager(this.app, this.settings, this.registry);

    // Register view
    this.registerView(VIEW_TYPE_CHAT, (leaf) => {
      this.chatView = new ChatView(
        leaf,
        this.app,
        this.conversationManager,
        this.conversationStore,
        this.registry,
        this.settings
      );
      return this.chatView;
    });

    // Ribbon icon
    this.addRibbonIcon('bot', 'AI 智能体', () => {
      this.activateView();
    });

    // Commands
    this.addCommand({
      id: 'open-chat',
      name: '打开 AI 对话',
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: 'new-chat',
      name: '新建 AI 对话',
      callback: () => {
        this.conversationManager.setConversation(createConversation());
        this.activateView();
      },
    });

    this.addCommand({
      id: 'chat-selection',
      name: '对选中文本提问',
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection) {
          this.activateView();
          // The context manager will pick up the selection automatically
        }
      },
    });

    // Settings tab
    this.addSettingTab(new AIAgentSettingTab(this.app, this));

    console.log('AI 智能体已加载');
  }

  async onunload(): Promise<void> {
    this.chatView = null;
    console.log('AI 智能体已卸载');
  }

  async saveSettings(): Promise<void> {
    await this.settingsStore.save(this.settings);
    this.conversationManager.updateSettings(this.settings);
    if (this.chatView) {
      this.chatView.updateSettings(this.settings);
    }
  }

  private registerTools(): void {
    this.registry.registerAll(createFileTools(this.app));
    this.registry.registerAll(createMetadataTools(this.app));
    this.registry.registerAll(createSearchTools(this.app));
    this.registry.registerAll(createEditorTools(this.app));
    this.registry.registerAll(createWorkspaceTools(this.app));
    this.registry.registerAll(createNoteTools(this.app));
    this.registry.registerAll(createCommandTools(this.app));
    this.registry.registerAll(createSystemTools(this.app));
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_CHAT,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }
}
