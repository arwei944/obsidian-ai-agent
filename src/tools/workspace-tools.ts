import type { App, TFile, WorkspaceLeaf } from 'obsidian';
import { TFile as TFileClass, MarkdownView } from 'obsidian';
import type { ToolDefinition, ToolResult } from '../types/tool-types';

export function createWorkspaceTools(app: App): ToolDefinition[] {
  const open_file: ToolDefinition = {
    name: 'open_file',
    description: 'Open a file in the workspace. Can open in current tab, new tab, split pane, or new window.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to open' },
        mode: {
          type: 'string',
          description: 'Where to open the file',
          enum: ['current', 'tab', 'split-vertical', 'split-horizontal', 'window'],
        },
      },
      required: ['path'],
    },
    riskLevel: 'low',
    category: 'workspace',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const mode = (input.mode as string) || 'tab';
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      let leaf: WorkspaceLeaf;
      switch (mode) {
        case 'current':
          leaf = app.workspace.activeLeaf || app.workspace.getLeaf('tab');
          break;
        case 'tab':
          leaf = app.workspace.getLeaf('tab');
          break;
        case 'split-vertical':
          leaf = app.workspace.getLeaf('split', 'vertical');
          break;
        case 'split-horizontal':
          leaf = app.workspace.getLeaf('split', 'horizontal');
          break;
        case 'window':
          leaf = app.workspace.getLeaf('window');
          break;
        default:
          leaf = app.workspace.getLeaf('tab');
      }

      await leaf.openFile(file);
      return { content: `Opened ${path} in ${mode}` };
    },
  };

  const close_tab: ToolDefinition = {
    name: 'close_tab',
    description: 'Close the current tab or the tab containing a specific file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional: close the tab with this file. If omitted, closes the active tab.' },
      },
      required: [],
    },
    riskLevel: 'low',
    category: 'workspace',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string | undefined;

      if (path) {
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFileClass)) {
          return { content: `Error: File not found: ${path}`, isError: true };
        }
        const leaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
          if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) {
            leaf.detach();
            return { content: `Closed tab: ${path}` };
          }
        }
        return { content: `No tab found with file: ${path}` };
      }

      const leaf = app.workspace.activeLeaf;
      if (leaf) {
        leaf.detach();
        return { content: 'Closed active tab' };
      }
      return { content: 'No active tab to close' };
    },
  };

  const get_active_file: ToolDefinition = {
    name: 'get_active_file',
    description: 'Get information about the currently active file in the editor.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    riskLevel: 'low',
    category: 'workspace',
    execute: async (): Promise<ToolResult> => {
      const file = app.workspace.getActiveFile();
      if (!file) {
        return { content: 'No active file.' };
      }

      const view = app.workspace.getActiveViewOfType(MarkdownView);
      const info: Record<string, unknown> = {
        path: file.path,
        name: file.name,
        extension: file.extension,
        size: file.stat.size,
        modified: new Date(file.stat.mtime).toISOString(),
      };

      if (view) {
        info.mode = view.getMode();
        info.lineCount = view.editor.lineCount();
        info.cursor = view.editor.getCursor();
      }

      return { content: JSON.stringify(info, null, 2) };
    },
  };

  const get_open_files: ToolDefinition = {
    name: 'get_open_files',
    description: 'Get a list of all currently open files in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    riskLevel: 'low',
    category: 'workspace',
    execute: async (): Promise<ToolResult> => {
      const files: { path: string; pinned: boolean; type: string }[] = [];

      app.workspace.iterateAllLeaves(leaf => {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file) {
          files.push({
            path: view.file.path,
            pinned: leaf.getViewState().pinned || false,
            type: view.getMode(),
          });
        }
      });

      if (files.length === 0) {
        return { content: 'No files are currently open.' };
      }

      return {
        content: `${files.length} open files:\n${files.map(f => `${f.path} (${f.type}${f.pinned ? ', pinned' : ''})`).join('\n')}`,
      };
    },
  };

  const toggle_sidebar: ToolDefinition = {
    name: 'toggle_sidebar',
    description: 'Toggle the left or right sidebar visibility.',
    inputSchema: {
      type: 'object',
      properties: {
        side: { type: 'string', enum: ['left', 'right'], description: 'Which sidebar to toggle' },
      },
      required: ['side'],
    },
    riskLevel: 'low',
    category: 'workspace',
    execute: async (input): Promise<ToolResult> => {
      const side = input.side as string;
      if (side === 'left') {
        app.commands.executeCommandById('app:toggle-left-sidebar');
      } else {
        app.commands.executeCommandById('app:toggle-right-sidebar');
      }
      return { content: `Toggled ${side} sidebar` };
    },
  };

  const show_panel: ToolDefinition = {
    name: 'show_panel',
    description: 'Open a specific Obsidian panel (graph, outline, search, backlinks, tags).',
    inputSchema: {
      type: 'object',
      properties: {
        panel: {
          type: 'string',
          enum: ['graph', 'local-graph', 'outline', 'search', 'backlinks', 'tags', 'file-explorer', 'bookmarks'],
          description: 'Which panel to open',
        },
      },
      required: ['panel'],
    },
    riskLevel: 'low',
    category: 'workspace',
    execute: async (input): Promise<ToolResult> => {
      const panel = input.panel as string;
      const commandMap: Record<string, string> = {
        'graph': 'graph:open',
        'local-graph': 'graph:local',
        'outline': 'outline:open',
        'search': 'global-search:open',
        'backlinks': 'backlink:open',
        'tags': 'tag-pane:open',
        'file-explorer': 'file-explorer:open',
        'bookmarks': 'bookmarks:open',
      };

      const commandId = commandMap[panel];
      if (!commandId) {
        return { content: `Error: Unknown panel: ${panel}`, isError: true };
      }

      app.commands.executeCommandById(commandId);
      return { content: `Opened ${panel} panel` };
    },
  };

  return [open_file, close_tab, get_active_file, get_open_files, toggle_sidebar, show_panel];
}
