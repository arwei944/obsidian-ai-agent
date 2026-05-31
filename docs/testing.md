# Obsidian AI Agent Plugin — 测试文档

> 版本: 1.0.0 | 日期: 2026-05-31 | 状态: Draft

---

## 1. 测试策略

### 1.1 测试层次

```
┌─────────────────────────────────────────────┐
│           E2E 测试 (端到端)                   │  手动 + 自动化
│     在真实 Obsidian 环境中测试完整流程          │
├─────────────────────────────────────────────┤
│           集成测试                             │  自动化
│     测试模块间交互、API 调用、工具执行           │
├─────────────────────────────────────────────┤
│           单元测试                             │  自动化
│     测试独立函数、类、工具逻辑                   │
├─────────────────────────────────────────────┤
│           静态分析                             │  自动化
│     TypeScript 类型检查、ESLint                │
└─────────────────────────────────────────────┘
```

### 1.2 测试工具

| 工具 | 用途 |
|---|---|
| **Vitest** | 单元测试和集成测试框架 |
| **@testing-library/svelte** | Svelte 组件测试 |
| **mock-obsidian** | Obsidian API mock |
| **nock** | HTTP 请求 mock (API 调用) |
| **TypeScript tsc** | 类型检查 |
| **ESLint** | 代码规范检查 |

### 1.3 测试覆盖率目标

| 模块 | 目标覆盖率 |
|---|---|
| 工具层 (tools/) | >= 90% |
| 核心层 (core/) | >= 80% |
| 存储层 (storage/) | >= 85% |
| 工具函数 (utils/) | >= 90% |
| UI 层 (ui/) | >= 60% |
| 整体 | >= 80% |

---

## 2. 单元测试

### 2.1 文件工具测试

```typescript
// tests/tools/file-tools.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockApp, createMockVault } from '../mocks/obsidian';
import { registerFileTools } from '../../src/tools/file-tools';
import { ToolRegistry } from '../../src/tools/tool-registry';

describe('File Tools', () => {
  let registry: ToolRegistry;
  let mockApp: any;
  let mockVault: any;
  let mockContext: any;

  beforeEach(() => {
    mockApp = createMockApp();
    mockVault = mockApp.vault;
    registry = new ToolRegistry();
    registerFileTools(registry, mockApp);
    mockContext = {
      app: mockApp,
      vault: mockVault,
      workspace: mockApp.workspace,
      metadataCache: mockApp.metadataCache,
      fileManager: mockApp.fileManager,
      activeFile: null,
      activeEditor: null
    };
  });

  describe('read_file', () => {
    it('should read file content successfully', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue({
        path: 'test.md',
        instanceof: () => true
      });
      mockVault.read.mockResolvedValue('# Hello World');

      const tool = registry.getTool('read_file');
      const result = await tool.execute({ path: 'test.md' }, mockContext);

      expect(result.content).toBe('# Hello World');
      expect(result.isError).toBeUndefined();
    });

    it('should return error for non-existent file', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const tool = registry.getTool('read_file');
      const result = await tool.execute({ path: 'nonexistent.md' }, mockContext);

      expect(result.isError).toBe(true);
      expect(result.content).toContain('File not found');
    });

    it('should support offset and limit for pagination', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}`);
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'big.md' });
      mockVault.read.mockResolvedValue(lines.join('\n'));

      const tool = registry.getTool('read_file');
      const result = await tool.execute(
        { path: 'big.md', offset: 10, limit: 5 },
        mockContext
      );

      expect(result.content).toContain('Line 10');
      expect(result.content).toContain('Line 14');
      expect(result.content).not.toContain('Line 15');
    });

    it('should truncate large files', async () => {
      const largeContent = 'x'.repeat(60000);
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'large.md' });
      mockVault.read.mockResolvedValue(largeContent);

      const tool = registry.getTool('read_file');
      const result = await tool.execute({ path: 'large.md' }, mockContext);

      expect(result.truncated).toBe(true);
      expect(result.content.length).toBeLessThan(60000);
      expect(result.content).toContain('TRUNCATED');
    });
  });

  describe('write_file', () => {
    it('should create new file when it does not exist', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);
      mockVault.create.mockResolvedValue({ path: 'new.md' });

      const tool = registry.getTool('write_file');
      const result = await tool.execute(
        { path: 'new.md', content: '# New Note' },
        mockContext
      );

      expect(mockVault.create).toHaveBeenCalledWith('new.md', '# New Note');
      expect(result.content).toContain('File created');
    });

    it('should overwrite existing file', async () => {
      const existingFile = { path: 'existing.md' };
      mockVault.getAbstractFileByPath.mockReturnValue(existingFile);
      mockVault.modify.mockResolvedValue(undefined);

      const tool = registry.getTool('write_file');
      const result = await tool.execute(
        { path: 'existing.md', content: 'Updated' },
        mockContext
      );

      expect(mockVault.modify).toHaveBeenCalledWith(existingFile, 'Updated');
      expect(result.content).toContain('File updated');
    });

    it('should create parent folders if needed', async () => {
      mockVault.getAbstractFileByPath
        .mockReturnValueOnce(null) // file check
        .mockReturnValueOnce(null); // parent check
      mockVault.createFolder.mockResolvedValue(undefined);
      mockVault.create.mockResolvedValue({ path: 'deep/nested/file.md' });

      const tool = registry.getTool('write_file');
      await tool.execute(
        { path: 'deep/nested/file.md', content: 'content' },
        mockContext
      );

      expect(mockVault.createFolder).toHaveBeenCalledWith('deep/nested');
    });
  });

  describe('edit_file', () => {
    it('should replace first occurrence by default', async () => {
      const file = { path: 'test.md' };
      mockVault.getAbstractFileByPath.mockReturnValue(file);
      mockVault.read.mockResolvedValue('Hello World Hello');
      mockVault.modify.mockResolvedValue(undefined);

      const tool = registry.getTool('edit_file');
      const result = await tool.execute(
        { path: 'test.md', find: 'Hello', replace: 'Hi' },
        mockContext
      );

      expect(mockVault.modify).toHaveBeenCalledWith(file, 'Hi World Hello');
      expect(result.content).toContain('1 occurrence');
    });

    it('should replace all occurrences when all=true', async () => {
      const file = { path: 'test.md' };
      mockVault.getAbstractFileByPath.mockReturnValue(file);
      mockVault.read.mockResolvedValue('Hello World Hello');
      mockVault.modify.mockResolvedValue(undefined);

      const tool = registry.getTool('edit_file');
      const result = await tool.execute(
        { path: 'test.md', find: 'Hello', replace: 'Hi', all: true },
        mockContext
      );

      expect(mockVault.modify).toHaveBeenCalledWith(file, 'Hi World Hi');
      expect(result.content).toContain('2 occurrence');
    });

    it('should support regex replacement', async () => {
      const file = { path: 'test.md' };
      mockVault.getAbstractFileByPath.mockReturnValue(file);
      mockVault.read.mockResolvedValue('Date: 2024-01-15');
      mockVault.modify.mockResolvedValue(undefined);

      const tool = registry.getTool('edit_file');
      const result = await tool.execute(
        { path: 'test.md', find: '\\d{4}-\\d{2}-\\d{2}', replace: '2026-05-31', regex: true },
        mockContext
      );

      expect(mockVault.modify).toHaveBeenCalledWith(file, 'Date: 2026-05-31');
    });

    it('should report when no matches found', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'test.md' });
      mockVault.read.mockResolvedValue('Hello World');

      const tool = registry.getTool('edit_file');
      const result = await tool.execute(
        { path: 'test.md', find: 'nonexistent', replace: 'x' },
        mockContext
      );

      expect(result.content).toContain('No matches found');
    });
  });
});
```

### 2.2 元数据工具测试

```typescript
// tests/tools/metadata-tools.test.ts

describe('Metadata Tools', () => {
  describe('get_frontmatter', () => {
    it('should return frontmatter as YAML', async () => {
      const file = { path: 'note.md' };
      mockVault.getAbstractFileByPath.mockReturnValue(file);
      mockMetadataCache.getFileCache.mockReturnValue({
        frontmatter: {
          title: 'My Note',
          tags: ['test', 'example'],
          created: '2026-01-01'
        }
      });

      const tool = registry.getTool('get_frontmatter');
      const result = await tool.execute({ path: 'note.md' }, mockContext);

      const parsed = JSON.parse(result.content);
      expect(parsed.title).toBe('My Note');
      expect(parsed.tags).toEqual(['test', 'example']);
    });

    it('should return message when no frontmatter exists', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'note.md' });
      mockMetadataCache.getFileCache.mockReturnValue({});

      const tool = registry.getTool('get_frontmatter');
      const result = await tool.execute({ path: 'note.md' }, mockContext);

      expect(result.content).toContain('No frontmatter');
    });
  });

  describe('get_backlinks', () => {
    it('should return all files linking to the target', async () => {
      const file = { path: 'target.md' };
      mockVault.getAbstractFileByPath.mockReturnValue(file);
      mockMetadataCache.getBacklinksForFile.mockReturnValue({
        data: new Map([
          ['note-a.md', [{ original: '[[target]]' }]],
          ['note-b.md', [{ original: '[[target|Alias]]' }]]
        ])
      });

      const tool = registry.getTool('get_backlinks');
      const result = await tool.execute({ path: 'target.md' }, mockContext);

      expect(result.content).toContain('note-a.md');
      expect(result.content).toContain('note-b.md');
    });
  });
});
```

### 2.3 搜索工具测试

```typescript
// tests/tools/search-tools.test.ts

describe('Search Tools', () => {
  describe('search_vault', () => {
    it('should find files matching query', async () => {
      mockVault.getMarkdownFiles.mockReturnValue([
        { path: 'note1.md' },
        { path: 'note2.md' },
        { path: 'note3.md' }
      ]);
      mockVault.read
        .mockResolvedValueOnce('This contains the keyword')
        .mockResolvedValueOnce('No match here')
        .mockResolvedValueOnce('Another keyword match');

      const tool = registry.getTool('search_vault');
      const result = await tool.execute({ query: 'keyword' }, mockContext);

      expect(result.content).toContain('note1.md');
      expect(result.content).toContain('note3.md');
      expect(result.content).not.toContain('note2.md');
    });

    it('should return message when no results found', async () => {
      mockVault.getMarkdownFiles.mockReturnValue([]);
      mockVault.read.mockResolvedValue('nothing');

      const tool = registry.getTool('search_vault');
      const result = await tool.execute({ query: 'nonexistent' }, mockContext);

      expect(result.content).toContain('No results');
    });
  });
});
```

### 2.4 编辑器工具测试

```typescript
// tests/tools/editor-tools.test.ts

describe('Editor Tools', () => {
  let mockEditor: any;
  let mockView: any;

  beforeEach(() => {
    mockEditor = {
      getValue: vi.fn(),
      setValue: vi.fn(),
      getSelection: vi.fn(),
      replaceSelection: vi.fn(),
      getCursor: vi.fn(),
      setCursor: vi.fn(),
      getLine: vi.fn(),
      setLine: vi.fn(),
      lineCount: vi.fn(),
      somethingSelected: vi.fn(),
      scrollIntoView: vi.fn()
    };
    mockView = {
      editor: mockEditor,
      file: { path: 'active.md' }
    };
    mockContext.workspace.getActiveViewOfType.mockReturnValue(mockView);
  });

  describe('insert_at_cursor', () => {
    it('should insert text at cursor position', async () => {
      mockEditor.replaceSelection.mockImplementation(() => {});

      const tool = registry.getTool('insert_at_cursor');
      const result = await tool.execute(
        { text: 'Hello World' },
        mockContext
      );

      expect(mockEditor.replaceSelection).toHaveBeenCalledWith('Hello World');
      expect(result.content).toContain('inserted');
    });

    it('should insert after current line when after=true', async () => {
      mockEditor.getLine.mockReturnValue('Current line');
      mockEditor.getCursor.mockReturnValue({ line: 5, ch: 0 });
      mockEditor.setLine.mockImplementation(() => {});

      const tool = registry.getTool('insert_at_cursor');
      await tool.execute({ text: 'New content', after: true }, mockContext);

      expect(mockEditor.setLine).toHaveBeenCalledWith(5, 'Current line\nNew content');
    });
  });

  describe('apply_formatting', () => {
    it('should apply bold formatting to selection', async () => {
      mockEditor.somethingSelected.mockReturnValue(true);
      mockEditor.getSelection.mockReturnValue('selected text');
      mockEditor.replaceSelection.mockImplementation(() => {});

      const tool = registry.getTool('apply_formatting');
      await tool.execute({ format: 'bold' }, mockContext);

      expect(mockEditor.replaceSelection).toHaveBeenCalledWith('**selected text**');
    });

    it('should insert heading prefix', async () => {
      mockEditor.somethingSelected.mockReturnValue(false);
      mockEditor.getSelection.mockReturnValue('');
      mockEditor.replaceSelection.mockImplementation(() => {});

      const tool = registry.getTool('apply_formatting');
      await tool.execute({ format: 'h2', text: 'Title' }, mockContext);

      expect(mockEditor.replaceSelection).toHaveBeenCalledWith('## Title');
    });

    it('should return error when no editor is active', async () => {
      mockContext.workspace.getActiveViewOfType.mockReturnValue(null);

      const tool = registry.getTool('apply_formatting');
      const result = await tool.execute({ format: 'bold' }, mockContext);

      expect(result.isError).toBe(true);
    });
  });
});
```

### 2.5 命令工具测试

```typescript
// tests/tools/command-tools.test.ts

describe('Command Tools', () => {
  describe('execute_command', () => {
    it('should execute a valid command', async () => {
      (mockApp as any).commands = {
        commands: {
          'editor:toggle-bold': { name: 'Toggle bold' }
        },
        executeCommandById: vi.fn()
      };

      const tool = registry.getTool('execute_command');
      const result = await tool.execute(
        { command_id: 'editor:toggle-bold' },
        mockContext
      );

      expect((mockApp as any).commands.executeCommandById)
        .toHaveBeenCalledWith('editor:toggle-bold');
      expect(result.content).toContain('Toggle bold');
    });

    it('should return error for unknown command', async () => {
      (mockApp as any).commands = {
        commands: {},
        executeCommandById: vi.fn()
      };

      const tool = registry.getTool('execute_command');
      const result = await tool.execute(
        { command_id: 'nonexistent:command' },
        mockContext
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Command not found');
    });
  });

  describe('list_commands', () => {
    it('should list all commands', async () => {
      (mockApp as any).commands = {
        commands: {
          'editor:toggle-bold': { name: 'Toggle bold' },
          'app:go-back': { name: 'Navigate back' }
        }
      };

      const tool = registry.getTool('list_commands');
      const result = await tool.execute({}, mockContext);

      expect(result.content).toContain('editor:toggle-bold');
      expect(result.content).toContain('app:go-back');
    });

    it('should filter commands by keyword', async () => {
      (mockApp as any).commands = {
        commands: {
          'editor:toggle-bold': { name: 'Toggle bold' },
          'editor:toggle-italics': { name: 'Toggle italics' },
          'app:go-back': { name: 'Navigate back' }
        }
      };

      const tool = registry.getTool('list_commands');
      const result = await tool.execute({ filter: 'toggle' }, mockContext);

      expect(result.content).toContain('editor:toggle-bold');
      expect(result.content).toContain('editor:toggle-italics');
      expect(result.content).not.toContain('app:go-back');
    });
  });
});
```

### 2.6 核心模块测试

```typescript
// tests/core/conversation-manager.test.ts

describe('ConversationManager', () => {
  describe('agentic loop', () => {
    it('should handle end_turn correctly', async () => {
      mockAgentCore.streamMessage.mockImplementation(
        async (system, tools, messages, callbacks) => {
          callbacks.onText('Hello!');
          callbacks.onComplete({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Hello!' }]
          });
        }
      );

      await conversationManager.sendMessage('Hi', mockContext, {
        onText: vi.fn(),
        onThinking: vi.fn(),
        onToolUse: vi.fn(),
        onError: vi.fn(),
        onComplete: vi.fn()
      });

      const messages = conversationManager.getActiveMessages();
      expect(messages).toHaveLength(2); // user + assistant
    });

    it('should execute tools and loop on tool_use', async () => {
      let callCount = 0;
      mockAgentCore.streamMessage.mockImplementation(
        async (system, tools, messages, callbacks) => {
          callCount++;
          if (callCount === 1) {
            // First call: tool_use
            callbacks.onToolUse({ name: 'read_file', input: { path: 'test.md' } });
            callbacks.onComplete({
              stop_reason: 'tool_use',
              content: [
                { type: 'text', text: 'Let me read that file.' },
                { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: 'test.md' } }
              ]
            });
          } else {
            // Second call: end_turn
            callbacks.onText('The file contains Hello World');
            callbacks.onComplete({
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: 'The file contains Hello World' }]
            });
          }
        }
      );

      mockToolExecutor.executeAll.mockResolvedValue([
        { type: 'tool_result', tool_use_id: 'tool_1', content: 'Hello World' }
      ]);

      await conversationManager.sendMessage('Read test.md', mockContext, {
        onText: vi.fn(),
        onThinking: vi.fn(),
        onToolUse: vi.fn(),
        onError: vi.fn(),
        onComplete: vi.fn()
      });

      expect(mockToolExecutor.executeAll).toHaveBeenCalled();
      expect(callCount).toBe(2);
    });

    it('should stop after max iterations', async () => {
      mockAgentCore.streamMessage.mockImplementation(
        async (system, tools, messages, callbacks) => {
          callbacks.onComplete({
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: 'loop.md' } }
            ]
          });
        }
      );

      mockToolExecutor.executeAll.mockResolvedValue([
        { type: 'tool_result', tool_use_id: 'tool_1', content: 'content' }
      ]);

      const callbacks = {
        onText: vi.fn(),
        onThinking: vi.fn(),
        onToolUse: vi.fn(),
        onError: vi.fn(),
        onComplete: vi.fn()
      };

      await conversationManager.sendMessage('infinite loop', mockContext, callbacks);

      // Should have stopped at maxIterations (20)
      expect(mockAgentCore.streamMessage).toHaveBeenCalledTimes(20);
    });
  });
});
```

### 2.7 存储测试

```typescript
// tests/storage/snapshot-store.test.ts

describe('SnapshotStore', () => {
  it('should save snapshot before edit', async () => {
    mockVault.getAbstractFileByPath.mockReturnValue({ path: 'test.md' });
    mockVault.read.mockResolvedValue('original content');

    await snapshotStore.saveSnapshot('edit_file', { path: 'test.md' });

    const history = snapshotStore.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].originalContent).toBe('original content');
    expect(history[0].toolName).toBe('edit_file');
  });

  it('should restore file on undo', async () => {
    mockVault.getAbstractFileByPath.mockReturnValue({ path: 'test.md' });
    mockVault.read.mockResolvedValue('original');
    mockVault.modify.mockResolvedValue(undefined);

    await snapshotStore.saveSnapshot('edit_file', { path: 'test.md' });
    const result = await snapshotStore.undoLast();

    expect(mockVault.modify).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'test.md' }),
      'original'
    );
    expect(result).toContain('Undid');
  });

  it('should limit snapshot count', async () => {
    for (let i = 0; i < 55; i++) {
      mockVault.read.mockResolvedValue(`content ${i}`);
      await snapshotStore.saveSnapshot('edit_file', { path: `file${i}.md` });
    }

    expect(snapshotStore.getHistory()).toHaveLength(50);
  });
});
```

---

## 3. 集成测试

### 3.1 API 通信集成测试

```typescript
// tests/integration/api-integration.test.ts

import nock from 'nock';

describe('API Integration', () => {
  beforeEach(() => {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, mockStreamResponse);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should send correct request format', async () => {
    const scope = nock('https://api.anthropic.com')
      .post('/v1/messages', (body) => {
        expect(body.model).toBe('claude-sonnet-4-6');
        expect(body.stream).toBe(true);
        expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
        expect(body.tools).toBeDefined();
        expect(body.messages).toBeDefined();
        return true;
      })
      .reply(200, createSSEStream([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'message_stop' }
      ]));

    await agentCore.streamMessage(
      'system prompt',
      [{ name: 'test_tool', description: 'test', input_schema: {} }],
      [{ role: 'user', content: 'test' }],
      { onText: vi.fn(), onThinking: vi.fn(), onToolUse: vi.fn(), onError: vi.fn(), onComplete: vi.fn() }
    );

    expect(scope.isDone()).toBe(true);
  });

  it('should handle streaming correctly', async () => {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, createSSEStream([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'World' } },
        { type: 'message_stop' }
      ]), { 'Content-Type': 'text/event-stream' });

    const textChunks: string[] = [];
    await agentCore.streamMessage(
      'system', [], [{ role: 'user', content: 'test' }],
      {
        onText: (delta) => textChunks.push(delta),
        onThinking: vi.fn(),
        onToolUse: vi.fn(),
        onError: vi.fn(),
        onComplete: vi.fn()
      }
    );

    expect(textChunks).toEqual(['Hello ', 'World']);
  });
});
```

### 3.2 工具执行集成测试

```typescript
// tests/integration/tool-execution.test.ts

describe('Tool Execution Integration', () => {
  it('should execute parallel tool calls', async () => {
    const toolUseBlocks = [
      { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: 'a.md' } },
      { type: 'tool_use', id: 'tool_2', name: 'read_file', input: { path: 'b.md' } }
    ];

    mockVault.getAbstractFileByPath
      .mockReturnValueOnce({ path: 'a.md' })
      .mockReturnValueOnce({ path: 'b.md' });
    mockVault.read
      .mockResolvedValueOnce('Content A')
      .mockResolvedValueOnce('Content B');

    const results = await toolExecutor.executeAll(toolUseBlocks, mockCallbacks);

    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('Content A');
    expect(results[1].content).toBe('Content B');
    expect(results[0].tool_use_id).toBe('tool_1');
    expect(results[1].tool_use_id).toBe('tool_2');
  });

  it('should require confirmation for high-risk operations', async () => {
    const toolUseBlocks = [
      { type: 'tool_use', id: 'tool_1', name: 'delete_file', input: { path: 'important.md' } }
    ];

    // Mock user denying confirmation
    vi.spyOn(toolExecutor, 'requestConfirmation').mockResolvedValue(false);

    const results = await toolExecutor.executeAll(toolUseBlocks, mockCallbacks);

    expect(results[0].is_error).toBe(true);
    expect(results[0].content).toContain('cancelled');
  });

  it('should handle mixed success and failure', async () => {
    const toolUseBlocks = [
      { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: 'exists.md' } },
      { type: 'tool_use', id: 'tool_2', name: 'read_file', input: { path: 'missing.md' } }
    ];

    mockVault.getAbstractFileByPath
      .mockReturnValueOnce({ path: 'exists.md' })
      .mockReturnValueOnce(null);
    mockVault.read.mockResolvedValueOnce('content');

    const results = await toolExecutor.executeAll(toolUseBlocks, mockCallbacks);

    expect(results[0].is_error).toBeUndefined();
    expect(results[1].is_error).toBe(true);
  });
});
```

---

## 4. 端到端测试

### 4.1 E2E 测试场景

在真实 Obsidian 环境中手动执行以下场景：

#### 场景 E2E-001: 基本对话

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 安装插件，输入 API Key | 插件启用成功 |
| 2 | 点击 Ribbon 图标 | 右侧边栏打开聊天面板 |
| 3 | 输入 "Hello" | 流式显示 AI 回复 |
| 4 | 输入 "我当前打开的是什么文件？" | AI 能正确回答当前文件名 |

#### 场景 E2E-002: 文件操作

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 输入 "创建一个名为 TestNote.md 的笔记" | 文件被创建，AI 确认 |
| 2 | 输入 "在 TestNote.md 中写入 Hello World" | 文件内容被写入 |
| 3 | 输入 "读取 TestNote.md 的内容" | AI 正确显示内容 |
| 4 | 输入 "删除 TestNote.md" | 弹出确认对话框 |
| 5 | 确认删除 | 文件移到回收站 |

#### 场景 E2E-003: 编辑器操控

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 打开一个笔记 | 编辑器显示内容 |
| 2 | 选中一段文字 | 编辑器中有选区 |
| 3 | 输入 "把选中的文字加粗" | 选中文字被 `**...**` 包裹 |
| 4 | 输入 "在光标处插入一个 callout" | 插入 callout 块 |

#### 场景 E2E-004: 元数据操作

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 输入 "给当前文件加上 tags: ai, test" | frontmatter 被更新 |
| 2 | 输入 "列出所有使用 #ai 标签的文件" | AI 列出相关文件 |
| 3 | 输入 "哪些文件链接到了当前笔记？" | AI 显示反向链接 |

#### 场景 E2E-005: 工作区管理

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 输入 "左右分屏打开两个笔记" | 编辑器分屏显示 |
| 2 | 输入 "关闭右边的标签" | 右边标签关闭 |
| 3 | 输入 "打开全局图谱" | 图谱视图打开 |

#### 场景 E2E-006: 搜索功能

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 输入 "搜索包含'机器学习'的笔记" | 列出匹配文件 |
| 2 | 输入 "找所有未完成的任务" | 列出所有 `- [ ]` 项 |

#### 场景 E2E-007: 安全与确认

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 输入 "删除所有文件" | AI 询问确认或拒绝 |
| 2 | 确认删除 | 显示确认对话框 |
| 3 | 取消 | 操作取消，文件不变 |
| 4 | 执行一个修改操作后输入 "撤销" | 快照恢复原始内容 |

#### 场景 E2E-008: 上下文感知

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 打开文件 A，选中一段文字 | 上下文栏显示当前文件 |
| 2 | 输入 "解释一下选中的内容" | AI 基于选中文本回答 |
| 3 | 输入 "@文件B.md 总结这个文件" | AI 读取文件 B 并总结 |

#### 场景 E2E-009: 错误处理

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 断开网络连接 | AI 回复错误提示 |
| 2 | 输入无效的 API Key | 提示 API Key 错误 |
| 3 | 输入一个不存在的文件路径 | AI 告知文件不存在 |

#### 场景 E2E-010: 持久化

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 进行一段对话 | 对话有历史记录 |
| 2 | 关闭 Obsidian | — |
| 3 | 重新打开 Obsidian | 对话历史恢复 |
| 4 | 切换到之前的会话 | 完整历史可见 |

---

## 5. 性能测试

### 5.1 性能指标

| 测试项 | 目标 | 测试方法 |
|---|---|---|
| 首次 token 延迟 | < 2s | 从发送请求到收到第一个 token |
| 工具执行延迟 | < 500ms | 单个文件读取/写入操作 |
| 搜索性能 | < 3s | 1000 文件 vault 全文搜索 |
| 插件加载时间 | < 500ms | 从 Obsidian 启动到插件就绪 |
| 内存占用 | < 100MB | 持续使用 1 小时后的内存 |
| UI 响应性 | 60fps | 工具执行期间的 UI 流畅度 |
| 对话存储大小 | < 10MB | 100 轮对话的存储空间 |

### 5.2 压力测试

| 场景 | 测试方法 | 预期 |
|---|---|---|
| 大 vault | 10,000 个文件的 vault 中搜索 | 5 秒内返回 |
| 长对话 | 100 轮对话后继续交互 | 正常工作，对话压缩生效 |
| 大文件 | 读取 1MB+ 的文件 | 正确截断，不卡顿 |
| 并发工具 | 一次调用 5 个工具 | 并行执行，3 秒内完成 |

---

## 6. 兼容性测试

### 6.1 Obsidian 版本

| 版本 | 测试状态 | 备注 |
|---|---|---|
| 1.5.x | 待测试 | 最低支持版本 |
| 1.6.x | 待测试 | |
| 1.7.x | 待测试 | |
| 1.8+ | 待测试 | 最新版本 |

### 6.2 操作系统

| OS | 测试状态 | 备注 |
|---|---|---|
| Windows 11 | 待测试 | |
| macOS 14+ | 待测试 | |
| Ubuntu 22.04 | 待测试 | |
| iOS (Mobile) | 待测试 | 功能受限 |
| Android (Mobile) | 待测试 | 功能受限 |

### 6.3 主题兼容

| 主题 | 测试状态 |
|---|---|
| Default (Light) | 待测试 |
| Default (Dark) | 待测试 |
| Minimal | 待测试 |
| Things | 待测试 |
| Primary | 待测试 |

---

## 7. 安全测试

### 7.1 安全检查清单

| ID | 检查项 | 测试方法 | 预期 |
|---|---|---|---|
| SEC-T001 | API Key 不出现在日志中 | 开启调试日志，执行操作 | 无 API Key 泄露 |
| SEC-T002 | API Key 不出现在 UI 中 | 检查设置面板 | 显示为 `••••••` |
| SEC-T003 | API Key 使用加密存储 | 检查数据文件 | Key 不在明文 JSON 中 |
| SEC-T004 | 工具输入验证 | 发送恶意路径 `../../etc/passwd` | 被拒绝或沙箱化 |
| SEC-T005 | 确认对话框不可绕过 | 修改代码跳过确认 | 高风险操作仍需确认 |
| SEC-T006 | 对话历史不含敏感信息 | 检查存储文件 | 无 API Key 或密钥 |
| SEC-T007 | XSS 防护 | AI 回复中包含 `<script>` 标签 | 被正确转义 |
| SEC-T008 | 路径遍历防护 | 使用 `../` 路径 | 被规范化或拒绝 |

---

## 8. 测试运行

### 8.1 命令

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行带覆盖率的测试
npm run test:coverage

# 运行特定文件
npx vitest run tests/tools/file-tools.test.ts

# 监听模式
npx vitest --watch
```

### 8.2 CI/CD 测试流程

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
```

---

## 9. 测试用例追踪矩阵

| 需求 ID | 测试用例 | 类型 | 状态 |
|---|---|---|---|
| FILE-001 | file-tools.test.ts > read_file | 单元 | 待编写 |
| FILE-002 | file-tools.test.ts > write_file | 单元 | 待编写 |
| FILE-003 | file-tools.test.ts > write_file (overwrite) | 单元 | 待编写 |
| FILE-005 | file-tools.test.ts > edit_file | 单元 | 待编写 |
| FILE-006 | file-tools.test.ts > delete_file | 单元 | 待编写 |
| META-001 | metadata-tools.test.ts > get_frontmatter | 单元 | 待编写 |
| META-005 | metadata-tools.test.ts > get_backlinks | 单元 | 待编写 |
| SEARCH-001 | search-tools.test.ts > search_vault | 单元 | 待编写 |
| EDIT-003 | editor-tools.test.ts > insert_at_cursor | 单元 | 待编写 |
| EDIT-006 | editor-tools.test.ts > apply_formatting | 单元 | 待编写 |
| CMD-001 | command-tools.test.ts > execute_command | 单元 | 待编写 |
| AGENT-003 | conversation-manager.test.ts > agentic loop | 单元 | 待编写 |
| AGENT-001 | api-integration.test.ts > request format | 集成 | 待编写 |
| AGENT-002 | api-integration.test.ts > streaming | 集成 | 待编写 |
| AGENT-004 | tool-execution.test.ts > parallel tools | 集成 | 待编写 |
| SAFE-004 | tool-execution.test.ts > confirmation | 集成 | 待编写 |
| SAFE-006 | snapshot-store.test.ts > undo | 单元 | 待编写 |
| CHAT-001 ~ CHAT-018 | E2E-001 ~ E2E-010 | E2E | 待执行 |
| PERF-001 ~ PERF-006 | 性能测试章节 | 性能 | 待执行 |
| COMPAT-001 ~ COMPAT-004 | 兼容性测试章节 | 兼容 | 待执行 |
| SEC-001 ~ SEC-005 | 安全测试章节 | 安全 | 待执行 |

---

## 10. 已知问题与限制

| ID | 描述 | 影响 | 解决方案 |
|---|---|---|---|
| KNOWN-001 | Obsidian `requestUrl` 不支持流式 | 无法使用内置 HTTP | 使用 Node.js `https` 模块 |
| KNOWN-002 | Mobile 端无法使用 Node.js 模块 | 移动端功能受限 | Mobile 使用 `requestUrl` 非流式 |
| KNOWN-003 | CM6 装饰在重启后丢失 | 自定义高亮不持久 | 通过插件扩展重新应用 |
| KNOWN-004 | 大 vault 搜索可能较慢 | 线性搜索 O(n) | 限制结果数量，后续加索引 |
| KNOWN-005 | API 成本 | 频繁调用产生费用 | Prompt Caching + 使用 Haiku 做简单任务 |
