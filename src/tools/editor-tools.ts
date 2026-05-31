import type { App, Editor, MarkdownView } from 'obsidian';
import { MarkdownView as MarkdownViewClass } from 'obsidian';
import type { ToolDefinition, ToolResult } from '../types/tool-types';

export function createEditorTools(app: App): ToolDefinition[] {
  function getEditor(): { editor: Editor; view: MarkdownView } | null {
    const leaves = app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownViewClass && view.editor) {
        return { editor: view.editor, view };
      }
    }
    return null;
  }

  const get_editor_content: ToolDefinition = {
    name: 'get_editor_content',
    description: 'Get the content and metadata of the currently active editor (cursor position, selection, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        include_content: { type: 'boolean', description: 'Include full text content. Default: true' },
      },
      required: [],
    },
    riskLevel: 'low',
    category: 'editor',
    execute: async (input): Promise<ToolResult> => {
      const result = getEditor();
      if (!result) {
        return { content: 'Error: No active editor found. Open a note first.', isError: true };
      }

      const { editor, view } = result;
      const cursor = editor.getCursor();
      const selection = editor.getSelection();

      const info: Record<string, unknown> = {
        file: view.file?.path || 'unknown',
        lines: editor.lineCount(),
        cursor: { line: cursor.line, ch: cursor.ch },
        hasSelection: !!selection,
        selectionLength: selection.length,
      };

      if (selection) {
        info.selection = selection;
      }

      if (input.include_content !== false) {
        const content = editor.getValue();
        if (content.length > 50000) {
          info.content = content.slice(0, 50000) + '\n[... truncated]';
          info.truncated = true;
        } else {
          info.content = content;
        }
      }

      return { content: JSON.stringify(info, null, 2) };
    },
  };

  const set_editor_content: ToolDefinition = {
    name: 'set_editor_content',
    description: 'Replace the entire content of the active editor.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'New content for the editor' },
      },
      required: ['content'],
    },
    riskLevel: 'medium',
    category: 'editor',
    execute: async (input): Promise<ToolResult> => {
      const result = getEditor();
      if (!result) {
        return { content: 'Error: No active editor found.', isError: true };
      }

      result.editor.setValue(input.content as string);
      return { content: `Editor content replaced (${(input.content as string).length} chars)` };
    },
  };

  const insert_at_cursor: ToolDefinition = {
    name: 'insert_at_cursor',
    description: 'Insert text at the current cursor position in the active editor.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to insert' },
        after: { type: 'boolean', description: 'Insert after the current line instead of at cursor. Default: false' },
      },
      required: ['text'],
    },
    riskLevel: 'medium',
    category: 'editor',
    execute: async (input): Promise<ToolResult> => {
      const result = getEditor();
      if (!result) {
        return { content: 'Error: No active editor found.', isError: true };
      }

      const { editor } = result;
      const text = input.text as string;

      if (input.after) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        editor.setLine(cursor.line, line + '\n' + text);
      } else {
        editor.replaceSelection(text);
      }

      return { content: `Inserted ${text.length} chars` };
    },
  };

  const replace_selection: ToolDefinition = {
    name: 'replace_selection',
    description: 'Replace the currently selected text in the editor. If nothing is selected, inserts at cursor.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Replacement text' },
      },
      required: ['text'],
    },
    riskLevel: 'medium',
    category: 'editor',
    execute: async (input): Promise<ToolResult> => {
      const result = getEditor();
      if (!result) {
        return { content: 'Error: No active editor found.', isError: true };
      }

      result.editor.replaceSelection(input.text as string);
      return { content: `Replaced selection with ${(input.text as string).length} chars` };
    },
  };

  const apply_formatting: ToolDefinition = {
    name: 'apply_formatting',
    description: 'Apply markdown formatting to the current selection or insert formatting markers. Supports bold, italic, code, headings, lists, callouts, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: 'Format type',
          enum: ['bold', 'italic', 'code', 'strikethrough', 'highlight',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'bullet', 'numbered', 'checklist', 'blockquote',
            'callout', 'codeblock', 'table', 'link', 'math', 'mathblock', 'hr'],
        },
        text: { type: 'string', description: 'Text to format. If not provided, uses current selection.' },
        language: { type: 'string', description: 'Language for code blocks (e.g., "python", "typescript").' },
      },
      required: ['format'],
    },
    riskLevel: 'medium',
    category: 'editor',
    execute: async (input): Promise<ToolResult> => {
      const result = getEditor();
      if (!result) {
        return { content: 'Error: No active editor found.', isError: true };
      }

      const { editor } = result;
      const format = input.format as string;
      const text = (input.text as string) || editor.getSelection() || '';
      const language = (input.language as string) || '';

      const wraps: Record<string, [string, string]> = {
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
        hr: ['\n---\n', ''],
      };

      if (format === 'callout') {
        editor.replaceSelection(`> [!note]\n> ${text.split('\n').join('\n> ')}`);
      } else if (format === 'codeblock') {
        editor.replaceSelection(`\`\`\`${language}\n${text}\n\`\`\``);
      } else if (format === 'mathblock') {
        editor.replaceSelection(`$$\n${text}\n$$`);
      } else if (format === 'table') {
        editor.replaceSelection(text || '| Header | Header |\n| --- | --- |\n| Cell | Cell |');
      } else {
        const [prefix, suffix] = wraps[format] || ['', ''];
        if (editor.somethingSelected()) {
          editor.replaceSelection(`${prefix}${editor.getSelection()}${suffix}`);
        } else {
          editor.replaceSelection(`${prefix}${text}${suffix}`);
        }
      }

      return { content: `Applied ${format} formatting` };
    },
  };

  const get_cursor_info: ToolDefinition = {
    name: 'get_cursor_info',
    description: 'Get the current cursor position and selection information.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    riskLevel: 'low',
    category: 'editor',
    execute: async (): Promise<ToolResult> => {
      const result = getEditor();
      if (!result) {
        return { content: 'Error: No active editor found.', isError: true };
      }

      const { editor } = result;
      const cursor = editor.getCursor();
      const selection = editor.getSelection();
      const line = editor.getLine(cursor.line);

      return {
        content: JSON.stringify({
          cursor: { line: cursor.line, ch: cursor.ch },
          lineContent: line,
          totalLines: editor.lineCount(),
          hasSelection: !!selection,
          selection: selection || null,
          selectionRange: selection ? {
            from: editor.getCursor('from'),
            to: editor.getCursor('to'),
          } : null,
        }, null, 2),
      };
    },
  };

  const scroll_editor: ToolDefinition = {
    name: 'scroll_editor',
    description: 'Scroll the editor to a specific line or position.',
    inputSchema: {
      type: 'object',
      properties: {
        line: { type: 'number', description: 'Line number to scroll to (0-indexed)' },
        center: { type: 'boolean', description: 'Center the line in the viewport. Default: true' },
      },
      required: ['line'],
    },
    riskLevel: 'low',
    category: 'editor',
    execute: async (input): Promise<ToolResult> => {
      const result = getEditor();
      if (!result) {
        return { content: 'Error: No active editor found.', isError: true };
      }

      const { editor } = result;
      const line = input.line as number;
      const center = input.center !== false;

      if (line < 0 || line >= editor.lineCount()) {
        return { content: `Error: Line ${line} out of range (0-${editor.lineCount() - 1})`, isError: true };
      }

      editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, center);
      return { content: `Scrolled to line ${line}` };
    },
  };

  return [get_editor_content, set_editor_content, insert_at_cursor, replace_selection, apply_formatting, get_cursor_info, scroll_editor];
}
