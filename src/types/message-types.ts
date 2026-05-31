export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallRecord[];
  thinking?: string;
  isStreaming?: boolean;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: string;
  isError: boolean;
  duration: number;
}

export interface StoredConversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallRecord[];
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createConversation(title?: string): Conversation {
  const now = Date.now();
  return {
    id: generateId(),
    title: title || `Chat ${new Date(now).toLocaleString()}`,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}
