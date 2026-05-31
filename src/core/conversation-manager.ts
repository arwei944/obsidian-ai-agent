import type { App } from 'obsidian';
import type { PluginSettings } from '../types/settings-types';
import type { Conversation, ChatMessage, ToolCallRecord } from '../types/message-types';
import type { ApiMessage, ContentBlock, ToolUseBlock, ToolResultBlock, ApiResponse } from '../types/api-types';
import type { ToolSchema } from './agent-core';
import { AgentCore } from './agent-core';
import { ContextManager } from './context-manager';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolExecutor, type ToolExecutionCallbacks } from '../tools/tool-executor';
import { generateId, createConversation } from '../types/message-types';

export interface ConversationCallbacks {
  onTextDelta: (delta: string) => void;
  onThinkingDelta: (delta: string) => void;
  onToolStart: (name: string, input: Record<string, unknown>) => void;
  onToolEnd: (name: string, result: string, isError: boolean, duration: number) => void;
  onMessageComplete: (message: ChatMessage) => void;
  onError: (error: Error) => void;
  onIterationStart: (iteration: number) => void;
  onConfirmationNeeded: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
}

export class ConversationManager {
  private conversation: Conversation;
  private agentCore: AgentCore;
  private contextManager: ContextManager;
  private toolExecutor: ToolExecutor;
  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor(
    private app: App,
    private settings: PluginSettings,
    private registry: ToolRegistry
  ) {
    this.conversation = createConversation();
    this.agentCore = new AgentCore(settings);
    this.contextManager = new ContextManager(app, settings);
    this.toolExecutor = new ToolExecutor(registry, app, settings);
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
    this.agentCore.updateSettings(settings);
    this.contextManager.updateSettings(settings);
    this.toolExecutor.updateSettings(settings);
  }

  getConversation(): Conversation {
    return this.conversation;
  }

  setConversation(conv: Conversation): void {
    this.conversation = conv;
  }

  isNew(): boolean {
    return this.conversation.messages.length === 0;
  }

  isBusy(): boolean {
    return this.isRunning;
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.agentCore.abort();
    this.isRunning = false;
  }

  async sendUserMessage(userText: string, callbacks: ConversationCallbacks): Promise<void> {
    if (this.isRunning) return;
    if (!userText.trim()) return;

    this.isRunning = true;
    this.abortController = new AbortController();

    // Add user message to conversation
    const userMsg: ChatMessage = {
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    };
    this.conversation.messages.push(userMsg);
    this.conversation.updatedAt = Date.now();

    // Auto-title from first message
    if (this.conversation.messages.length === 1) {
      this.conversation.title = userText.slice(0, 60) + (userText.length > 60 ? '...' : '');
    }

    try {
      await this.runAgenticLoop(callbacks);
    } catch (error) {
      callbacks.onError(error as Error);
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  private async runAgenticLoop(callbacks: ConversationCallbacks): Promise<void> {
    let iteration = 0;
    const maxIterations = this.settings.maxToolIterations;

    while (iteration < maxIterations) {
      if (this.abortController?.signal.aborted) break;

      iteration++;
      callbacks.onIterationStart(iteration);

      // Build context and system prompt
      const context = await this.contextManager.buildContext();
      const systemPrompt = this.contextManager.buildSystemPrompt(context, this.settings.customSystemPrompt);

      // Build API messages from conversation history
      const apiMessages = this.buildApiMessages();

      // Get tool schemas
      const toolSchemas: ToolSchema[] = this.registry.getSchemas();

      // Accumulate assistant content for this turn
      let turnText = '';
      let turnThinking = '';
      const turnToolCalls: ToolCallRecord[] = [];

      // Send to API
      const response = await this.sendToApi(systemPrompt, toolSchemas, apiMessages, {
        onText: (delta) => {
          turnText += delta;
          callbacks.onTextDelta(delta);
        },
        onThinking: (delta) => {
          turnThinking += delta;
          callbacks.onThinkingDelta(delta);
        },
        onToolUse: (_tool) => {
          // Handled after response
        },
        onError: (error) => {
          callbacks.onError(error);
        },
        onComplete: () => {
          // Handled below
        },
      });

      if (!response) break;

      // Check for tool_use blocks
      const toolUseBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === 'tool_use'
      );

      if (toolUseBlocks.length > 0) {
        // Execute tools
        const toolCallbacks: ToolExecutionCallbacks = {
          onToolStart: (name, input) => callbacks.onToolStart(name, input),
          onToolEnd: (name, result, duration) => {
            turnToolCalls.push({
              id: '',
              name,
              input: {},
              result: result.content,
              isError: !!result.isError,
              duration,
            });
            callbacks.onToolEnd(name, result.content, !!result.isError, duration);
          },
          onConfirmationNeeded: async (tool, input) => {
            return callbacks.onConfirmationNeeded(tool.name, input);
          },
        };

        const toolResults = await this.toolExecutor.executeAll(toolUseBlocks, toolCallbacks);

        // Add assistant message with tool_use to conversation
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: turnText || '(using tools)',
          timestamp: Date.now(),
          thinking: turnThinking || undefined,
          toolCalls: turnToolCalls.length > 0 ? turnToolCalls : undefined,
        };
        this.conversation.messages.push(assistantMsg);

        // Add tool results as user message for the next iteration
        const toolResultMsg: ChatMessage = {
          role: 'user',
          content: JSON.stringify(toolResults.map(r => ({
            type: 'tool_result',
            tool_use_id: r.tool_use_id,
            content: r.content,
            is_error: r.is_error,
          }))),
          timestamp: Date.now(),
        };
        this.conversation.messages.push(toolResultMsg);

        // Continue the loop
        continue;
      }

      // No tools — final text response
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: turnText,
        timestamp: Date.now(),
        thinking: turnThinking || undefined,
      };
      this.conversation.messages.push(assistantMsg);
      this.conversation.updatedAt = Date.now();
      callbacks.onMessageComplete(assistantMsg);
      break;
    }

    if (iteration >= maxIterations) {
      const limitMsg: ChatMessage = {
        role: 'assistant',
        content: `[Reached maximum tool iterations (${maxIterations}). Stopping.]`,
        timestamp: Date.now(),
      };
      this.conversation.messages.push(limitMsg);
      callbacks.onMessageComplete(limitMsg);
    }
  }

  private sendToApi(
    system: string,
    tools: ToolSchema[],
    messages: ApiMessage[],
    callbacks: {
      onText: (delta: string) => void;
      onThinking: (delta: string) => void;
      onToolUse: (tool: ToolUseBlock) => void;
      onError: (error: Error) => void;
      onComplete: (response: ApiResponse) => void;
    }
  ): Promise<ApiResponse | null> {
    return new Promise((resolve) => {
      let resolved = false;

      this.agentCore.sendMessage(system, tools, messages, {
        onText: callbacks.onText,
        onThinking: callbacks.onThinking,
        onToolUse: callbacks.onToolUse,
        onError: (error) => {
          callbacks.onError(error);
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        },
        onComplete: (response) => {
          callbacks.onComplete(response);
          if (!resolved) {
            resolved = true;
            resolve(response);
          }
        },
      });
    });
  }

  private buildApiMessages(): ApiMessage[] {
    const messages: ApiMessage[] = [];

    for (const msg of this.conversation.messages) {
      if (msg.role === 'user') {
        // Check if this is a tool result message
        try {
          const parsed = JSON.parse(msg.content);
          if (Array.isArray(parsed) && parsed[0]?.type === 'tool_result') {
            messages.push({
              role: 'user',
              content: parsed as ToolResultBlock[],
            });
            continue;
          }
        } catch {
          // Not JSON, regular user message
        }
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        // Build content blocks for assistant messages with tool calls
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const blocks: ContentBlock[] = [];
          if (msg.thinking) {
            blocks.push({ type: 'thinking', thinking: msg.thinking });
          }
          if (msg.content && msg.content !== '(using tools)') {
            blocks.push({ type: 'text', text: msg.content });
          }
          for (const tc of msg.toolCalls) {
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input,
            });
          }
          messages.push({ role: 'assistant', content: blocks });
        } else {
          const blocks: ContentBlock[] = [];
          if (msg.thinking) {
            blocks.push({ type: 'thinking', thinking: msg.thinking });
          }
          blocks.push({ type: 'text', text: msg.content });
          messages.push({ role: 'assistant', content: blocks });
        }
      }
    }

    return messages;
  }
}
