# Obsidian AI Agent Plugin — 开发文档

> 版本: 1.0.0 | 日期: 2026-05-31 | 状态: Draft

---

## 1. 技术架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Obsidian Plugin Container                  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    main.ts (入口)                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │ │
│  │  │ Plugin   │  │ Commands │  │ Ribbon   │              │ │
│  │  │ Lifecycle│  │ Registry │  │ Icon     │              │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘              │ │
│  │       └──────────────┼─────────────┘                    │ │
│  └──────────────────────┼──────────────────────────────────┘ │
│                         │                                     │
│  ┌──────────────────────┼──────────────────────────────────┐ │
│  │              Core Layer (核心层)                          │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │ │
│  │  │ AgentCore   │  │ ToolManager │  │ ContextMgr  │    │ │
│  │  │ (LLM 通信)   │  │ (工具管理)    │  │ (上下文管理) │    │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │ │
│  │         │                │                │             │ │
│  │  ┌──────┴────────────────┴────────────────┴──────┐     │ │
│  │  │              ConversationManager               │     │ │
│  │  │           (对话管理 & Agentic Loop)              │     │ │
│  │  └────────────────────┬───────────────────────────┘     │ │
│  └───────────────────────┼─────────────────────────────────┘ │
│                          │                                    │
│  ┌───────────────────────┼─────────────────────────────────┐ │
│  │              Tool Layer (工具层)                          │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │ │
│  │  │ File   │ │ Meta   │ │ Search │ │ Editor │           │ │
│  │  │ Tools  │ │ Tools  │ │ Tools  │ │ Tools  │           │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘           │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │ │
│  │  │Workspc │ │ Note   │ │Command │ │ System │           │ │
│  │  │ Tools  │ │ Tools  │ │ Tools  │ │ Tools  │           │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              UI Layer (界面层)                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │
│  │  │  ChatView    │  │  SettingsTab  │  │  Modals      │   │ │
│  │  │  (Svelte 5)  │  │  (原生 DOM)   │  │  (确认/提示)  │   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈

| 层面 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 语言 | TypeScript | 5.x | 严格模式 |
| 运行时 | Electron (Chromium + Node.js) | Obsidian 内置 | 可用 Node.js 原生模块 |
| UI 框架 | Svelte | 5.x | 编译为 vanilla JS，零 runtime |
| 打包 | esbuild | 0.20+ | 官方推荐 |
| Obsidian API | obsidian | latest | 外部化依赖 |
| LLM 通信 | Node.js https | 内置 | 流式 SSE 解析 |
| 代码规范 | ESLint + Prettier | — | 统一代码风格 |

### 1.3 目录结构

```
obsidian-ai-plugin/
├── main.ts                          # 插件入口
├── manifest.json                    # 插件元数据
├── versions.json                    # 版本映射
├── styles.css                       # 全局样式
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── .eslintrc.json
├── .prettierrc
│
├── src/
│   ├── core/                        # 核心层
│   │   ├── agent-core.ts            # Claude API 通信
│   │   ├── conversation-manager.ts  # 对话管理 & Agentic Loop
│   │   ├── context-manager.ts       # 上下文构建与管理
│   │   ├── streaming.ts             # SSE 流式解析
│   │   └── token-counter.ts         # Token 估算
│   │
│   ├── tools/                       # 工具层
│   │   ├── tool-registry.ts         # 工具注册中心
│   │   ├── tool-executor.ts         # 工具执行引擎
│   │   ├── tool-types.ts            # 工具类型定义
│   │   ├── file-tools.ts            # 文件操作工具
│   │   ├── metadata-tools.ts        # 元数据工具
│   │   ├── search-tools.ts          # 搜索工具
│   │   ├── editor-tools.ts          # 编辑器工具
│   │   ├── workspace-tools.ts       # 工作区工具
│   │   ├── note-tools.ts            # 笔记操作工具
│   │   ├── command-tools.ts         # 命令执行工具
│   │   └── system-tools.ts          # 系统工具
│   │
│   ├── ui/                          # 界面层
│   │   ├── chat-view.ts             # 聊天视图 (ItemView)
│   │   ├── components/              # Svelte 组件
│   │   │   ├── ChatPanel.svelte     # 聊天主面板
│   │   │   ├── MessageList.svelte   # 消息列表
│   │   │   ├── MessageItem.svelte   # 单条消息
│   │   │   ├── InputBox.svelte      # 输入框
│   │   │   ├── ToolStatus.svelte    # 工具执行状态
│   │   │   ├── ContextBar.svelte    # 上下文指示栏
│   │   │   └── SessionList.svelte   # 会话列表
│   │   ├── modals/                  # 模态框
│   │   │   ├── confirm-modal.ts     # 确认对话框
│   │   │   └── context-modal.ts     # 上下文预览
│   │   └── settings-tab.ts          # 设置面板
│   │
│   ├── storage/                     # 存储层
│   │   ├── conversation-store.ts    # 对话持久化
│   │   ├── settings-store.ts        # 设置持久化
│   │   └── snapshot-store.ts        # 文件快照 (Undo)
│   │
│   ├── utils/                       # 工具函数
│   │   ├── markdown-renderer.ts     # Markdown 渲染
│   │   ├── path-utils.ts            # 路径处理
│   │   ├── debounce.ts              # 防抖
│   │   └── logger.ts                # 日志
│   │
│   └── types/                       # 类型定义
│       ├── api-types.ts             # API 相关类型
│       ├── tool-types.ts            # 工具相关类型
│       ├── message-types.ts         # 消息类型
│       └── settings-types.ts        # 设置类型
│
└── docs/                            # 文档
    ├── requirements.md
    ├── development.md
    └── testing.md
```

---

## 2. 核心模块设计

### 2.1 AgentCore — LLM 通信核心

**职责**: 与 Claude API 通信，处理流式响应。

```typescript
// src/core/agent-core.ts

interface AgentCoreConfig {
  apiKey: string;
  model: ClaudeModel;
  maxTokens: number;
  temperature: number;
  thinkingMode: 'adaptive' | 'off';
  effortLevel: 'low' | 'medium' | 'high' | 'max';
}

interface StreamCallbacks {
  onText: (delta: string) => void;
  onThinking: (delta: string) => void;
  onToolUse: (tool: ToolUseBlock) => void;
  onError: (error: ApiError) => void;
  onComplete: (message: Message) => void;
}

class AgentCore {
  private config: AgentCoreConfig;
  private abortController: AbortController | null = null;

  constructor(config: AgentCoreConfig) {}

  // 发送流式请求
  async streamMessage(
    system: SystemPrompt,
    tools: Tool[],
    messages: Message[],
    callbacks: StreamCallbacks
  ): Promise<void> {}

  // 中止当前请求
  abort(): void {}

  // 更新配置
  updateConfig(config: Partial<AgentCoreConfig>): void {}
}
```

**SSE 流式解析**:

```typescript
// src/core/streaming.ts

function parseSSEStream(
  response: IncomingMessage,
  onEvent: (event: SSEEvent) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): void {
  let buffer = '';

  response.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          onComplete();
          return;
        }
        try {
          onEvent(JSON.parse(data));
        } catch (e) {
          // 跳过不完整的数据
        }
      }
    }
  });

  response.on('end', onComplete);
  response.on('error', onError);
}
```

**API 请求构建**:

```typescript
function buildRequestBody(
  system: SystemPrompt,
  tools: Tool[],
  messages: Message[],
  config: AgentCoreConfig
): object {
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: true,
    system: [{
      type: 'text',
      text: system,
      cache_control: { type: 'ephemeral' }
    }],
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      cache_control: { type: 'ephemeral' }
    })),
    ...(config.thinkingMode === 'adaptive' ? {
      thinking: { type: 'adaptive' },
      output_config: { effort: config.effortLevel }
    } : {}),
    messages
  };
}
```

### 2.2 ConversationManager — 对话管理

**职责**: 管理对话历史、执行 Agentic Loop、处理上下文窗口。

```typescript
// src/core/conversation-manager.ts

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

class ConversationManager {
  private conversations: Map<string, Conversation>;
  private activeConversationId: string;
  private maxIterations: number = 20;

  // 发送消息并执行 Agentic Loop
  async sendMessage(
    userMessage: string,
    context: VaultContext,
    callbacks: StreamCallbacks
  ): Promise<void> {
    // 1. 构建消息
    const message = this.buildUserMessage(userMessage, context);
    this.getActiveConversation().messages.push(message);

    // 2. Agentic Loop
    await this.agenticLoop(callbacks);
  }

  private async agenticLoop(callbacks: StreamCallbacks): Promise<void> {
    const conversation = this.getActiveConversation();
    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      // 发送请求
      const response = await this.agentCore.streamMessage(
        this.buildSystemPrompt(),
        this.toolRegistry.getTools(),
        conversation.messages,
        callbacks
      );

      // 检查 stop_reason
      if (response.stop_reason === 'end_turn') {
        break;
      }

      if (response.stop_reason === 'pause_turn') {
        conversation.messages.push({
          role: 'assistant',
          content: response.content
        });
        continue;
      }

      if (response.stop_reason === 'tool_use') {
        // 提取工具调用
        const toolUseBlocks = response.content.filter(
          b => b.type === 'tool_use'
        );

        // 添加 assistant 消息
        conversation.messages.push({
          role: 'assistant',
          content: response.content
        });

        // 执行工具
        const toolResults = await this.toolExecutor.executeAll(
          toolUseBlocks,
          callbacks
        );

        // 添加工具结果
        conversation.messages.push({
          role: 'user',
          content: toolResults
        });
      }
    }
  }
}
```

### 2.3 ToolManager — 工具管理

**职责**: 注册工具、定义工具 schema、分发执行。

```typescript
// src/tools/tool-registry.ts

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  riskLevel: 'low' | 'medium' | 'high';
  category: 'file' | 'metadata' | 'search' | 'editor' | 'workspace' | 'note' | 'command' | 'system';
  execute: (input: Record<string, any>, context: ExecutionContext) => Promise<ToolResult>;
}

interface ExecutionContext {
  app: App;
  vault: Vault;
  workspace: Workspace;
  metadataCache: MetadataCache;
  fileManager: FileManager;
  activeFile: TFile | null;
  activeEditor: Editor | null;
}

interface ToolResult {
  content: string;
  isError?: boolean;
  truncated?: boolean;
  totalLength?: number;
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getToolsByCategory(category: string): ToolDefinition[] {
    return this.getTools().filter(t => t.category === category);
  }
}
```

### 2.4 ToolExecutor — 工具执行引擎

**职责**: 执行工具、处理确认、管理快照。

```typescript
// src/tools/tool-executor.ts

class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private settings: PluginSettings,
    private snapshotStore: SnapshotStore
  ) {}

  async executeAll(
    toolUseBlocks: ToolUseBlock[],
    callbacks: StreamCallbacks
  ): Promise<ToolResultBlock[]> {
    // 并行执行所有工具
    const results = await Promise.all(
      toolUseBlocks.map(block => this.executeOne(block, callbacks))
    );
    return results;
  }

  private async executeOne(
    block: ToolUseBlock,
    callbacks: StreamCallbacks
  ): Promise<ToolResultBlock> {
    const tool = this.registry.getTool(block.name);
    if (!tool) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: `Error: Unknown tool "${block.name}"`,
        is_error: true
      };
    }

    // 检查是否需要确认
    if (this.needsConfirmation(tool, block.input)) {
      const confirmed = await this.requestConfirmation(tool, block.input);
      if (!confirmed) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'Operation cancelled by user.',
          is_error: true
        };
      }
    }

    // 写操作前保存快照
    if (tool.riskLevel !== 'low') {
      await this.snapshotStore.saveSnapshot(block.name, block.input);
    }

    // 执行工具
    try {
      const result = await tool.execute(block.input, this.getExecutionContext());
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.content
      };
    } catch (error) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: `Error: ${error.message}`,
        is_error: true
      };
    }
  }

  private needsConfirmation(tool: ToolDefinition, input: any): boolean {
    switch (this.settings.confirmationPolicy) {
      case 'always':
        return true;
      case 'high_risk_only':
        return tool.riskLevel === 'high';
      case 'medium_and_high':
        return tool.riskLevel !== 'low';
      case 'never':
        return false;
      default:
        return tool.riskLevel === 'high';
    }
  }
}
```

### 2.5 ContextManager — 上下文管理

**职责**: 构建发送给 AI 的上下文信息。

```typescript
// src/core/context-manager.ts

interface VaultContext {
  currentFile?: {
    path: string;
    content: string;
    selection?: string;
    cursorLine?: number;
  };
  vaultStructure?: string;       // 简化的目录树
  recentFiles?: string[];        // 最近打开的文件
  allTags?: string[];            // 所有标签
  openFiles?: string[];          // 当前打开的文件
  platform?: string;             // 平台信息
  datetime?: string;             // 当前时间
}

class ContextManager {
  constructor(private app: App) {}

  buildContext(): VaultContext {
    const context: VaultContext = {};

    // 活动文件
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      context.currentFile = {
        path: activeFile.path,
        content: '', // 按需加载
        selection: activeView?.editor?.getSelection(),
        cursorLine: activeView?.editor?.getCursor().line
      };
    }

    // 最近文件
    context.recentFiles = this.app.workspace.getLastOpenFiles().slice(0, 10);

    // 打开的文件
    context.openFiles = [];
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view instanceof FileView && leaf.view.file) {
        context.openFiles.push(leaf.view.file.path);
      }
    });

    // 平台信息
    context.platform = Platform.isDesktop ? 'desktop' : 'mobile';
    context.datetime = new Date().toISOString();

    return context;
  }

  // 构建系统提示
  buildSystemPrompt(context: VaultContext, customPrompt?: string): string {
    return `You are an AI assistant integrated into the user's Obsidian vault.
You can read, write, create, delete, and search notes.
You can manipulate the editor, manage the workspace, and execute Obsidian commands.

## Current Context
- Vault: ${this.app.vault.getName()}
- Current file: ${context.currentFile?.path || 'none'}
- Selected text: ${context.currentFile?.selection || 'none'}
- Platform: ${context.platform}
- Time: ${context.datetime}
- Recent files: ${context.recentFiles?.join(', ') || 'none'}
- Open files: ${context.openFiles?.join(', ') || 'none'}

${customPrompt ? `\n## User Instructions\n${customPrompt}` : ''}

## Guidelines
- Always read a file before editing it
- Use fileManager.renameFile() instead of vault.rename() to auto-update links
- Use fileManager.processFrontMatter() for atomic frontmatter edits
- For destructive operations, confirm with the user first
- Report what you did after completing tool operations`;
  }
}
```

---

## 3. 工具实现详解

### 3.1 文件工具实现

```typescript
// src/tools/file-tools.ts

export function registerFileTools(registry: ToolRegistry, app: App): void {

  registry.register({
    name: 'read_file',
    description: 'Read the contents of a file in the vault. Returns the full text content.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to vault root, e.g., "notes/reading.md"'
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (0-indexed). Default: 0'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read. Default: all lines'
        }
      },
      required: ['path']
    },
    riskLevel: 'low',
    category: 'file',
    execute: async (input, ctx) => {
      const file = ctx.vault.getAbstractFileByPath(input.path);
      if (!(file instanceof TFile)) {
        return { content: `Error: File not found: ${input.path}`, isError: true };
      }

      let content = await ctx.vault.read(file);
      const lines = content.split('\n');

      // 分页支持
      const offset = input.offset || 0;
      const limit = input.limit || lines.length;
      const selectedLines = lines.slice(offset, offset + limit);

      const result = selectedLines.join('\n');
      const totalLines = lines.length;

      if (offset > 0 || limit < totalLines) {
        return {
          content: `[Lines ${offset}-${offset + selectedLines.length - 1} of ${totalLines}]\n\n${result}`,
          truncated: offset + limit < totalLines,
          totalLength: content.length
        };
      }

      // 大文件截断
      if (content.length > 50000) {
        return {
          content: content.slice(0, 50000) + `\n\n[TRUNCATED: File is ${content.length} chars. Use offset/limit to read more.]`,
          truncated: true,
          totalLength: content.length
        };
      }

      return { content: result };
    }
  });

  registry.register({
    name: 'write_file',
    description: 'Create a new file or overwrite an existing file. Creates parent folders if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file relative to vault root'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file'
        }
      },
      required: ['path', 'content']
    },
    riskLevel: 'medium',
    category: 'file',
    execute: async (input, ctx) => {
      const existing = ctx.vault.getAbstractFileByPath(input.path);
      if (existing instanceof TFile) {
        await ctx.vault.modify(existing, input.content);
        return { content: `File updated: ${input.path}` };
      } else {
        // 确保父目录存在
        const parentPath = input.path.split('/').slice(0, -1).join('/');
        if (parentPath) {
          const parent = ctx.vault.getAbstractFileByPath(parentPath);
          if (!parent) {
            await ctx.vault.createFolder(parentPath);
          }
        }
        await ctx.vault.create(input.path, input.content);
        return { content: `File created: ${input.path}` };
      }
    }
  });

  registry.register({
    name: 'edit_file',
    description: 'Edit a file by finding and replacing text. Supports exact match and regex.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file'
        },
        find: {
          type: 'string',
          description: 'Text to find (exact match by default)'
        },
        replace: {
          type: 'string',
          description: 'Text to replace with'
        },
        regex: {
          type: 'boolean',
          description: 'Treat find as regex pattern. Default: false'
        },
        all: {
          type: 'boolean',
          description: 'Replace all occurrences. Default: false (replace first only)'
        }
      },
      required: ['path', 'find', 'replace']
    },
    riskLevel: 'medium',
    category: 'file',
    execute: async (input, ctx) => {
      const file = ctx.vault.getAbstractFileByPath(input.path);
      if (!(file instanceof TFile)) {
        return { content: `Error: File not found: ${input.path}`, isError: true };
      }

      const original = await ctx.vault.read(file);
      let result: string;
      let count: number;

      if (input.regex) {
        const flags = input.all ? 'g' : '';
        const regex = new RegExp(input.find, flags);
        const matches = original.match(regex);
        count = matches ? matches.length : 0;
        result = original.replace(regex, input.replace);
      } else {
        if (input.all) {
          count = original.split(input.find).length - 1;
          result = original.replaceAll(input.find, input.replace);
        } else {
          count = original.includes(input.find) ? 1 : 0;
          result = original.replace(input.find, input.replace);
        }
      }

      if (count === 0) {
        return { content: `No matches found for "${input.find}"` };
      }

      await ctx.vault.modify(file, result);
      return { content: `Replaced ${count} occurrence(s) in ${input.path}` };
    }
  });

  // ... 更多文件工具
}
```

### 3.2 编辑器工具实现

```typescript
// src/tools/editor-tools.ts

export function registerEditorTools(registry: ToolRegistry, app: App): void {

  registry.register({
    name: 'get_editor_content',
    description: 'Get the full content of the currently active editor.',
    inputSchema: {
      type: 'object',
      properties: {
        include_metadata: {
          type: 'boolean',
          description: 'Include file path, cursor position, and selection info. Default: true'
        }
      }
    },
    riskLevel: 'low',
    category: 'editor',
    execute: async (input, ctx) => {
      const view = ctx.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        return { content: 'Error: No active editor', isError: true };
      }

      const editor = view.editor;
      const content = editor.getValue();

      if (input.include_metadata !== false) {
        const cursor = editor.getCursor();
        const selection = editor.getSelection();
        return {
          content: JSON.stringify({
            file: view.file?.path,
            lines: editor.lineCount(),
            cursor: { line: cursor.line, ch: cursor.ch },
            selection: selection || null,
            content: content
          }, null, 2)
        };
      }

      return { content };
    }
  });

  registry.register({
    name: 'insert_at_cursor',
    description: 'Insert text at the current cursor position in the active editor.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to insert at cursor position'
        },
        after: {
          type: 'boolean',
          description: 'Insert after the current line instead of at cursor. Default: false'
        }
      },
      required: ['text']
    },
    riskLevel: 'medium',
    category: 'editor',
    execute: async (input, ctx) => {
      const view = ctx.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        return { content: 'Error: No active editor', isError: true };
      }

      const editor = view.editor;

      if (input.after) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        editor.setLine(cursor.line, line + '\n' + input.text);
      } else {
        editor.replaceSelection(input.text);
      }

      return { content: `Text inserted (${input.text.length} chars)` };
    }
  });

  registry.register({
    name: 'apply_formatting',
    description: 'Apply markdown formatting to the current selection or insert formatting markers.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['bold', 'italic', 'code', 'strikethrough', 'highlight',
                 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                 'bullet', 'numbered', 'checklist', 'blockquote',
                 'callout', 'codeblock', 'table', 'link', 'math', 'mathblock'],
          description: 'Type of formatting to apply'
        },
        text: {
          type: 'string',
          description: 'Text to format. If not provided, uses current selection'
        }
      },
      required: ['format']
    },
    riskLevel: 'medium',
    category: 'editor',
    execute: async (input, ctx) => {
      const view = ctx.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        return { content: 'Error: No active editor', isError: true };
      }

      const editor = view.editor;
      const text = input.text || editor.getSelection() || '';

      const formatMap: Record<string, [string, string]> = {
        bold: ['**', '**'],
        italic: ['*', '*'],
        code: ['`', '`'],
        strikethrough: ['~~', '~~'],
        highlight: ['==', '=='],
        h1: ['# ', ''],
        h2: ['## ', ''],
        h3: ['### ', ''],
        h4: ['#### ', ''],
        h5: ['##### ', ''],
        h6: ['###### ', ''],
        bullet: ['- ', ''],
        numbered: ['1. ', ''],
        checklist: ['- [ ] ', ''],
        blockquote: ['> ', ''],
        link: ['[[', ']]'],
        math: ['$', '$'],
      };

      if (input.format === 'callout') {
        editor.replaceSelection(`> [!note]\n> ${text}`);
      } else if (input.format === 'codeblock') {
        editor.replaceSelection('```\n' + text + '\n```');
      } else if (input.format === 'mathblock') {
        editor.replaceSelection('$$\n' + text + '\n$$');
      } else if (input.format === 'table') {
        editor.replaceSelection('| Header | Header |\n| --- | --- |\n| Cell | Cell |');
      } else {
        const [prefix, suffix] = formatMap[input.format] || ['', ''];
        if (editor.somethingSelected()) {
          const sel = editor.getSelection();
          editor.replaceSelection(`${prefix}${sel}${suffix}`);
        } else {
          editor.replaceSelection(`${prefix}${text}${suffix}`);
        }
      }

      return { content: `Applied ${input.format} formatting` };
    }
  });

  // ... 更多编辑器工具
}
```

### 3.3 命令执行工具

```typescript
// src/tools/command-tools.ts

export function registerCommandTools(registry: ToolRegistry, app: App): void {

  registry.register({
    name: 'execute_command',
    description: 'Execute any registered Obsidian command by its ID. Use list_commands to discover available commands.',
    inputSchema: {
      type: 'object',
      properties: {
        command_id: {
          type: 'string',
          description: 'The command ID, e.g., "editor:toggle-bold", "app:go-back", "daily-notes:goto"'
        }
      },
      required: ['command_id']
    },
    riskLevel: 'medium',
    category: 'command',
    execute: async (input, ctx) => {
      // @ts-ignore
      const commands = (ctx.app as any).commands;
      const command = commands.commands[input.command_id];

      if (!command) {
        return {
          content: `Error: Command not found: ${input.command_id}. Use list_commands to see available commands.`,
          isError: true
        };
      }

      try {
        commands.executeCommandById(input.command_id);
        return { content: `Executed command: ${command.name} (${input.command_id})` };
      } catch (error) {
        return {
          content: `Error executing command ${input.command_id}: ${error.message}`,
          isError: true
        };
      }
    }
  });

  registry.register({
    name: 'list_commands',
    description: 'List all available Obsidian commands. Optionally filter by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Filter commands by keyword (case-insensitive)'
        },
        category: {
          type: 'string',
          enum: ['editor', 'app', 'workspace', 'file-explorer', 'daily-notes',
                 'templates', 'graph', 'outline', 'backlink', 'global-search'],
          description: 'Filter by command namespace'
        }
      }
    },
    riskLevel: 'low',
    category: 'command',
    execute: async (input, ctx) => {
      // @ts-ignore
      const commands = (ctx.app as any).commands;
      let entries = Object.entries(commands.commands) as [string, any][];

      if (input.category) {
        entries = entries.filter(([id]) => id.startsWith(input.category + ':'));
      }

      if (input.filter) {
        const filter = input.filter.toLowerCase();
        entries = entries.filter(([id, cmd]) =>
          id.toLowerCase().includes(filter) ||
          cmd.name.toLowerCase().includes(filter)
        );
      }

      const list = entries.slice(0, 50).map(([id, cmd]) => `${id} => ${cmd.name}`).join('\n');
      const total = entries.length;

      return {
        content: total > 50
          ? `${list}\n\n[Showing 50 of ${total} commands. Use filter to narrow down.]`
          : list
      };
    }
  });
}
```

---

## 4. UI 实现

### 4.1 ChatView — 聊天视图

```typescript
// src/ui/chat-view.ts

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import ChatPanel from './components/ChatPanel.svelte';

export const VIEW_TYPE_AI_CHAT = 'ai-agent-chat';

export class ChatView extends ItemView {
  private component: ChatPanel | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_AI_CHAT;
  }

  getDisplayText(): string {
    return 'AI Agent';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen(): Promise<void> {
    // 使用 Svelte 挂载聊天界面
    this.component = mount(ChatPanel, {
      target: this.contentEl,
      props: {
        app: this.app,
        plugin: this.plugin
      }
    }) as ChatPanel;
  }

  async onClose(): Promise<void> {
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }
  }
}
```

### 4.2 Svelte 组件结构

```svelte
<!-- src/ui/components/ChatPanel.svelte -->
<script lang="ts">
  import MessageList from './MessageList.svelte';
  import InputBox from './InputBox.svelte';
  import ContextBar from './ContextBar.svelte';
  import SessionList from './SessionList.svelte';

  let { app, plugin } = $props();
  let messages = $state([]);
  let isStreaming = $state(false);
  let context = $state({});
  let showSessionList = $state(false);
</script>

<div class="ai-agent-chat">
  <div class="chat-header">
    <button onclick={() => showSessionList = !showSessionList}>Sessions</button>
    <button onclick={() => plugin.newConversation()}>New Chat</button>
  </div>

  {#if showSessionList}
    <SessionList {plugin} />
  {/if}

  <ContextBar {context} />

  <MessageList {messages} {isStreaming} />

  <InputBox
    disabled={isStreaming}
    onsubmit={(msg) => plugin.sendMessage(msg)}
    onstop={() => plugin.stopGeneration()}
  />
</div>
```

### 4.3 设置面板

```typescript
// src/ui/settings-tab.ts

import { PluginSettingTab, Setting, App } from 'obsidian';
import type ObsidianAIAgent from '../../main';

export class AISettingTab extends PluginSettingTab {
  plugin: ObsidianAIAgent;

  constructor(app: App, plugin: ObsidianAIAgent) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // API Configuration
    containerEl.createEl('h2', { text: 'API Configuration' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your Anthropic API key. Stored securely in system keychain.')
      .addText(text => text
        .setPlaceholder('sk-ant-...')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Claude model to use')
      .addDropdown(dropdown => dropdown
        .addOption('claude-opus-4-7', 'Claude Opus 4.7 (Most capable)')
        .addOption('claude-sonnet-4-6', 'Claude Sonnet 4.6 (Balanced)')
        .addOption('claude-haiku-4-5', 'Claude Haiku 4.5 (Fastest)')
        .setValue(this.plugin.settings.model)
        .onChange(async (value) => {
          this.plugin.settings.model = value;
          await this.plugin.saveSettings();
        }));

    // ... 更多设置
  }
}
```

---

## 5. 存储设计

### 5.1 对话持久化

```typescript
// src/storage/conversation-store.ts

interface StoredConversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
}

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string; // 简化存储，只保留文本
  timestamp: number;
  toolCalls?: StoredToolCall[];
}

interface StoredToolCall {
  name: string;
  input: Record<string, any>;
  result: string;
  isError: boolean;
}

class ConversationStore {
  private basePath = 'conversations';

  async save(conversation: Conversation): Promise<void> {
    const path = `${this.basePath}/${conversation.id}.json`;
    await this.app.vault.adapter.write(path, JSON.stringify(conversation, null, 2));
  }

  async load(id: string): Promise<Conversation | null> {
    const path = `${this.basePath}/${id}.json`;
    try {
      const data = await this.app.vault.adapter.read(path);
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async list(): Promise<StoredConversation[]> {
    try {
      const listing = await this.app.vault.adapter.list(this.basePath);
      const conversations: StoredConversation[] = [];
      for (const file of listing.files) {
        const data = await this.app.vault.adapter.read(file);
        conversations.push(JSON.parse(data));
      }
      return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    const path = `${this.basePath}/${id}.json`;
    await this.app.vault.adapter.remove(path);
  }
}
```

### 5.2 文件快照 (Undo)

```typescript
// src/storage/snapshot-store.ts

interface Snapshot {
  id: string;
  toolName: string;
  toolInput: Record<string, any>;
  filePath: string;
  originalContent: string;
  timestamp: number;
}

class SnapshotStore {
  private snapshots: Snapshot[] = [];
  private maxSnapshots = 50;

  async saveSnapshot(toolName: string, input: any): Promise<void> {
    const filePath = input.path;
    if (!filePath) return;

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);

    const snapshot: Snapshot = {
      id: Date.now().toString(),
      toolName,
      toolInput: input,
      filePath,
      originalContent: content,
      timestamp: Date.now()
    };

    this.snapshots.push(snapshot);

    // 限制快照数量
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  async undoLast(): Promise<string | null> {
    const snapshot = this.snapshots.pop();
    if (!snapshot) return null;

    const file = this.app.vault.getAbstractFileByPath(snapshot.filePath);
    if (!(file instanceof TFile)) return null;

    await this.app.vault.modify(file, snapshot.originalContent);
    return `Undid ${snapshot.toolName} on ${snapshot.filePath}`;
  }

  getHistory(): Snapshot[] {
    return [...this.snapshots];
  }
}
```

---

## 6. Prompt Caching 策略

### 6.1 缓存层次

```
请求结构:
├── tools (cache_control: ephemeral)        ← 第1层缓存
├── system (cache_control: ephemeral)       ← 第2层缓存
└── messages
    ├── [历史消息前缀] (cache_control: ephemeral)  ← 第3层缓存
    ├── [最近N条消息]
    └── [当前用户消息]
```

### 6.2 缓存注意事项

- **不要在系统提示中插入动态内容**（如时间戳、请求 ID）
- **工具定义顺序保持稳定**（排序后序列化）
- **使用消息中的 content block 插入动态上下文**，而非修改系统提示
- 最小可缓存 token 数：Sonnet/Haiku = 2048，Opus = 4096

---

## 7. 错误处理策略

### 7.1 API 错误

| 错误码 | 类型 | 处理策略 |
|---|---|---|
| 400 | invalid_request_error | 提示用户检查配置 |
| 401 | authentication_error | 提示重新输入 API Key |
| 429 | rate_limit_error | 自动重试（指数退避，最多 3 次） |
| 500 | api_error | 自动重试（最多 2 次） |
| 529 | overloaded_error | 提示稍后重试 |

### 7.2 工具执行错误

- 所有工具错误返回 `is_error: true`，让 Claude 感知并调整策略
- 大文件结果截断并提示使用 offset/limit 分页
- 文件不存在时给出友好提示

### 7.3 用户中断

- 用户点击"停止"时调用 `AbortController.abort()`
- 流式传输中断后保留已接收的内容
- 工具执行中的操作无法中断（等待完成）

---

## 8. 构建与发布

### 8.1 构建脚本

```json
{
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "lint": "eslint src/ --ext .ts,.svelte",
    "format": "prettier --write src/"
  }
}
```

### 8.2 esbuild 配置要点

- 外部化 `obsidian` 模块
- Svelte 插件编译 `.svelte` 文件
- 输出 CommonJS 格式 `main.js`
- 生产模式启用 minify

### 8.3 发布清单

1. `npm run build` 生成 `main.js`
2. 确保 `manifest.json`, `styles.css`, `main.js` 在根目录
3. 创建 GitHub Release（tag 匹配 manifest.json 版本）
4. 附加三个文件为 Release Assets
5. 向 `obsidianmd/obsidian-releases` 提交 PR

---

## 9. 依赖清单

```json
{
  "devDependencies": {
    "@tsconfig/svelte": "^5.0.0",
    "@types/node": "^20.0.0",
    "esbuild": "^0.20.0",
    "esbuild-svelte": "^0.8.0",
    "eslint": "^8.0.0",
    "obsidian": "latest",
    "prettier": "^3.0.0",
    "svelte": "^5.0.0",
    "typescript": "^5.4.0"
  },
  "dependencies": {
    "none"
  }
}
```

**零运行时依赖** — 所有依赖均为 devDependencies，最终打包为单个 `main.js`。
