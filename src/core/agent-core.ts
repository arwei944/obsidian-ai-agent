import * as https from 'https';
import type { PluginSettings } from '../types/settings-types';
import type { ApiMessage, ContentBlock, ApiResponse, SSEEvent, ToolUseBlock } from '../types/api-types';
import { buildSSEParser } from './streaming';

export interface AgentCallbacks {
  onText: (delta: string) => void;
  onThinking: (delta: string) => void;
  onToolUse: (tool: ToolUseBlock) => void;
  onError: (error: Error) => void;
  onComplete: (response: ApiResponse) => void;
}

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class AgentCore {
  private abortController: AbortController | null = null;

  constructor(private settings: PluginSettings) {}

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async sendMessage(
    system: string,
    tools: ToolSchema[],
    messages: ApiMessage[],
    callbacks: AgentCallbacks
  ): Promise<void> {
    if (!this.settings.apiKey) {
      callbacks.onError(new Error('API Key 未配置，请在插件设置中填写。'));
      return;
    }

    this.abortController = new AbortController();

    if (this.settings.apiProvider === 'openai') {
      await this.sendOpenAI(system, tools, messages, callbacks);
    } else {
      await this.sendClaude(system, tools, messages, callbacks);
    }
  }

  // ── Claude API ──
  private async sendClaude(
    system: string,
    tools: ToolSchema[],
    messages: ApiMessage[],
    callbacks: AgentCallbacks
  ): Promise<void> {
    const body = this.buildClaudeBody(system, tools, messages);
    const postData = JSON.stringify(body);
    const endpoint = this.settings.apiEndpoint || 'https://api.anthropic.com';

    let hostname: string, port: number, apiPath: string;
    try {
      const url = new URL(endpoint);
      hostname = url.hostname;
      port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
      const basePath = url.pathname.replace(/\/$/, '');
      apiPath = basePath.endsWith('/v1')
        ? basePath + '/messages'
        : basePath + '/v1/messages';
    } catch {
      hostname = 'api.anthropic.com';
      port = 443;
      apiPath = '/v1/messages';
    }

    const options: https.RequestOptions = {
      hostname,
      port,
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    };

    this.doRequest(options, postData, this.parseClaudeStream(callbacks), callbacks);
  }

  private buildClaudeBody(
    system: string,
    tools: ToolSchema[],
    messages: ApiMessage[]
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.settings.model,
      max_tokens: this.settings.maxTokens,
      stream: true,
      system: [{
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' },
      }],
      messages,
    };

    if (tools.length > 0) {
      body.tools = tools.map((t, i) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
        ...(i === tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
      }));
    }

    if (this.settings.temperature !== undefined && this.settings.temperature !== 1) {
      body.temperature = this.settings.temperature;
    }

    if (this.settings.thinkingMode === 'adaptive') {
      body.thinking = { type: 'adaptive' };
      body.max_tokens = Math.max(this.settings.maxTokens, 16000);
    }

    return body;
  }

  private parseClaudeStream(callbacks: AgentCallbacks) {
    const contentBlocks: ContentBlock[] = [];
    let currentBlockIndex = -1;
    let currentBlockType = '';
    let currentToolInput = '';

    return {
      blocks: contentBlocks,
      onEvent: (event: SSEEvent) => {
        switch (event.type) {
          case 'content_block_start': {
            const block = event.content_block;
            if (!block) break;
            currentBlockIndex = event.index ?? contentBlocks.length;
            currentBlockType = block.type;
            if (block.type === 'text') {
              contentBlocks.push({ type: 'text', text: block.text || '' });
            } else if (block.type === 'thinking') {
              contentBlocks.push({ type: 'thinking', thinking: block.thinking || '' });
            } else if (block.type === 'tool_use') {
              currentToolInput = '';
              contentBlocks.push({
                type: 'tool_use',
                id: block.id || '',
                name: block.name || '',
                input: {},
              });
            }
            break;
          }
          case 'content_block_delta': {
            const delta = event.delta;
            if (!delta) break;
            if (delta.type === 'text_delta' && delta.text) {
              if (contentBlocks[currentBlockIndex]?.type === 'text') {
                (contentBlocks[currentBlockIndex] as { type: 'text'; text: string }).text += delta.text;
              }
              callbacks.onText(delta.text);
            } else if (delta.type === 'thinking_delta' && delta.thinking) {
              if (contentBlocks[currentBlockIndex]?.type === 'thinking') {
                (contentBlocks[currentBlockIndex] as { type: 'thinking'; thinking: string }).thinking += delta.thinking;
              }
              callbacks.onThinking(delta.thinking);
            } else if (delta.type === 'input_json_delta' && delta.partial_json) {
              currentToolInput += delta.partial_json;
            }
            break;
          }
          case 'content_block_stop': {
            if (currentBlockType === 'tool_use' && contentBlocks[currentBlockIndex]) {
              try {
                (contentBlocks[currentBlockIndex] as ToolUseBlock).input =
                  currentToolInput ? JSON.parse(currentToolInput) : {};
              } catch { /* incomplete */ }
            }
            break;
          }
        }
      },
      onComplete: () => {
        const hasToolUse = contentBlocks.some(b => b.type === 'tool_use');
        if (hasToolUse) {
          for (const block of contentBlocks) {
            if (block.type === 'tool_use') callbacks.onToolUse(block as ToolUseBlock);
          }
        }
        callbacks.onComplete({
          id: 'msg_' + Date.now().toString(36),
          type: 'message',
          role: 'assistant',
          content: contentBlocks,
          model: this.settings.model,
          stop_reason: hasToolUse ? 'tool_use' : 'end_turn',
          usage: { input_tokens: 0, output_tokens: 0 },
        });
      },
    };
  }

  // ── OpenAI API ──
  private async sendOpenAI(
    system: string,
    tools: ToolSchema[],
    messages: ApiMessage[],
    callbacks: AgentCallbacks
  ): Promise<void> {
    const body = this.buildOpenAIBody(system, tools, messages);
    const postData = JSON.stringify(body);
    const endpoint = this.settings.apiEndpoint || 'https://api.openai.com';

    let hostname: string, port: number, basePath: string;
    try {
      const url = new URL(endpoint);
      hostname = url.hostname;
      port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
      basePath = url.pathname.replace(/\/$/, '');
    } catch {
      hostname = 'api.openai.com';
      port = 443;
      basePath = '';
    }

    // 避免重复 /v1：如果端点已以 /v1 结尾，不再拼接
    const chatPath = basePath.endsWith('/v1')
      ? basePath + '/chat/completions'
      : basePath + '/v1/chat/completions';

    const options: https.RequestOptions = {
      hostname,
      port,
      path: chatPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.apiKey}`,
      },
    };

    this.doRequest(options, postData, this.parseOpenAIStream(callbacks), callbacks);
  }

  private buildOpenAIBody(
    system: string,
    tools: ToolSchema[],
    messages: ApiMessage[]
  ): Record<string, unknown> {
    const openaiMessages: Array<Record<string, unknown>> = [
      { role: 'system', content: system },
    ];

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (Array.isArray(msg.content)) {
          // Tool results — convert from Claude format
          for (const block of msg.content) {
            if (block.type === 'tool_result') {
              openaiMessages.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: block.content,
              });
            }
          }
        } else {
          openaiMessages.push({ role: 'user', content: msg.content });
        }
      } else if (msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          let textContent = '';
          const toolCalls: Array<Record<string, unknown>> = [];
          for (const block of msg.content) {
            if (block.type === 'text') {
              textContent += (textContent ? '\n' : '') + block.text;
            } else if (block.type === 'tool_use') {
              toolCalls.push({
                id: block.id,
                type: 'function',
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input),
                },
              });
            }
          }
          const assistantMsg: Record<string, unknown> = { role: 'assistant' };
          if (textContent) assistantMsg.content = textContent;
          if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
          openaiMessages.push(assistantMsg);
        } else {
          openaiMessages.push({ role: 'assistant', content: msg.content });
        }
      }
    }

    const body: Record<string, unknown> = {
      model: this.settings.model,
      max_tokens: this.settings.maxTokens,
      stream: true,
      messages: openaiMessages,
    };

    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    if (this.settings.temperature !== undefined && this.settings.temperature !== 1) {
      body.temperature = this.settings.temperature;
    }

    return body;
  }

  private parseOpenAIStream(callbacks: AgentCallbacks) {
    const contentBlocks: ContentBlock[] = [];
    let textContent = '';
    let textBlockIndex = -1;
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();

    return {
      blocks: contentBlocks,
      onEvent: (event: SSEEvent) => {
        // OpenAI SSE: event type is "chat.completion.chunk"
        const choice = (event as any).choices?.[0];
        if (!choice) return;
        const delta = choice.delta;
        if (!delta) return;

        if (delta.content) {
          if (textBlockIndex === -1) {
            textBlockIndex = contentBlocks.length;
            contentBlocks.push({ type: 'text', text: delta.content });
            textContent = delta.content;
          } else {
            (contentBlocks[textBlockIndex] as { type: 'text'; text: string }).text += delta.content;
            textContent += delta.content;
          }
          callbacks.onText(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsMap.has(idx)) {
              toolCallsMap.set(idx, { id: '', name: '', arguments: '' });
            }
            const existing = toolCallsMap.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          }
        }
      },
      onComplete: () => {
        // Convert accumulated tool calls to content blocks
        if (toolCallsMap.size > 0) {
          for (const [, tc] of toolCallsMap) {
            let input: Record<string, unknown> = {};
            try {
              input = tc.arguments ? JSON.parse(tc.arguments) : {};
            } catch { /* incomplete */ }
            const toolBlock: ToolUseBlock = {
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input,
            };
            contentBlocks.push(toolBlock);
            callbacks.onToolUse(toolBlock);
          }
        }

        callbacks.onComplete({
          id: 'msg_' + Date.now().toString(36),
          type: 'message',
          role: 'assistant',
          content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: textContent }],
          model: this.settings.model,
          stop_reason: toolCallsMap.size > 0 ? 'tool_use' : 'end_turn',
          usage: { input_tokens: 0, output_tokens: 0 },
        });
      },
    };
  }

  // ── Shared HTTP request handler ──
  private doRequest(
    options: https.RequestOptions,
    postData: string,
    parser: { blocks: ContentBlock[]; onEvent: (e: SSEEvent) => void; onComplete: () => void },
    callbacks: AgentCallbacks
  ): void {
    const req = https.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errorBody = '';
        res.on('data', (chunk: Buffer) => { errorBody += chunk.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(errorBody);
            callbacks.onError(new Error(`API 错误 ${res.statusCode}: ${parsed.error?.message || errorBody}`));
          } catch {
            callbacks.onError(new Error(`API 错误 ${res.statusCode}: ${errorBody}`));
          }
        });
        return;
      }

      const sseParser = buildSSEParser(
        (event: SSEEvent) => parser.onEvent(event),
        () => parser.onComplete(),
        (error: Error) => callbacks.onError(error)
      );

      res.on('data', (chunk: Buffer) => sseParser.write(chunk.toString()));
      res.on('end', () => sseParser.end());
    });

    req.on('error', (error: Error) => {
      if (error.name === 'AbortError') {
        callbacks.onError(new Error('请求已取消'));
      } else {
        callbacks.onError(error);
      }
    });

    if (this.abortController) {
      this.abortController.signal.addEventListener('abort', () => req.destroy());
    }

    req.write(postData);
    req.end();
  }
}
