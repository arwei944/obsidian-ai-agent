import type { StoredConversation, StoredMessage, Conversation, ChatMessage } from '../types/message-types';

interface DataStore {
  loadData(): Promise<Record<string, unknown>>;
  saveData(data: Record<string, unknown>): Promise<void>;
}

const STORAGE_KEY = 'obsidian-ai-agent-conversations';
const MAX_CONVERSATIONS = 100;

export class ConversationStore {
  constructor(private store: DataStore) {}

  async loadAll(): Promise<StoredConversation[]> {
    try {
      const data = await this.store.loadData();
      return (data?.[STORAGE_KEY] as StoredConversation[]) || [];
    } catch {
      return [];
    }
  }

  async save(conversation: Conversation): Promise<void> {
    const all = await this.loadAll();
    const stored: StoredConversation = {
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        toolCalls: m.toolCalls,
      })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };

    const existing = all.findIndex(c => c.id === conversation.id);
    if (existing >= 0) {
      all[existing] = stored;
    } else {
      all.unshift(stored);
    }

    while (all.length > MAX_CONVERSATIONS) {
      all.pop();
    }

    await this.saveAll(all);
  }

  async load(id: string): Promise<Conversation | null> {
    const all = await this.loadAll();
    const stored = all.find(c => c.id === id);
    if (!stored) return null;

    return {
      id: stored.id,
      title: stored.title,
      messages: stored.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        toolCalls: m.toolCalls,
      })),
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  }

  async delete(id: string): Promise<void> {
    const all = await this.loadAll();
    const filtered = all.filter(c => c.id !== id);
    await this.saveAll(filtered);
  }

  async getList(): Promise<{ id: string; title: string; updatedAt: number; messageCount: number }[]> {
    const all = await this.loadAll();
    return all.map(c => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
    }));
  }

  private async saveAll(conversations: StoredConversation[]): Promise<void> {
    const data = await this.store.loadData() || {};
    data[STORAGE_KEY] = conversations;
    await this.store.saveData(data);
  }
}
