import type { App, TFile } from 'obsidian';
import { Platform, MarkdownView, FileView } from 'obsidian';
import type { PluginSettings } from '../types/settings-types';

export interface VaultContext {
  currentFile?: {
    path: string;
    content: string;
    selection?: string;
    cursorLine?: number;
  };
  recentFiles: string[];
  openFiles: string[];
  platform: string;
  datetime: string;
  vaultName: string;
}

export class ContextManager {
  constructor(
    private app: App,
    private settings: PluginSettings
  ) {}

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  async buildContext(): Promise<VaultContext> {
    const context: VaultContext = {
      recentFiles: [],
      openFiles: [],
      platform: Platform.isDesktop ? 'desktop' : 'mobile',
      datetime: new Date().toISOString(),
      vaultName: this.app.vault.getName(),
    };

    // Active file
    if (this.settings.activeFileAsContext) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        let content = '';
        let selection: string | undefined;
        let cursorLine: number | undefined;

        if (activeView) {
          const editor = activeView.editor;
          selection = editor.getSelection() || undefined;
          cursorLine = editor.getCursor().line;

          if (this.settings.selectionAsContext && selection) {
            // Only include selection, not full file
            content = `[Selected text in ${activeFile.path}]:\n${selection}`;
          } else {
            // Include full file content (with size limit)
            try {
              const fullContent = await this.app.vault.cachedRead(activeFile);
              if (fullContent.length > 30000) {
                content = fullContent.slice(0, 30000) + '\n[... truncated]';
              } else {
                content = fullContent;
              }
            } catch {
              content = '[Unable to read file]';
            }
          }
        }

        context.currentFile = {
          path: activeFile.path,
          content,
          selection,
          cursorLine,
        };
      }
    }

    // Recent files
    context.recentFiles = this.app.workspace.getLastOpenFiles().slice(0, 10);

    // Open files
    const openFiles: string[] = [];
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view instanceof FileView && leaf.view.file) {
        openFiles.push(leaf.view.file.path);
      }
    });
    context.openFiles = [...new Set(openFiles)].slice(0, 20);

    return context;
  }

  buildSystemPrompt(context: VaultContext, customPrompt?: string): string {
    const parts: string[] = [];

    parts.push(`You are an AI agent integrated into the user's Obsidian vault. You can fully operate Obsidian through natural language — reading, writing, creating, deleting, and searching notes; manipulating the editor; managing the workspace; and executing Obsidian commands.

## Current Context
- Vault: ${context.vaultName}
- Platform: ${context.platform}
- Time: ${context.datetime}`);

    if (context.currentFile) {
      parts.push(`- Active file: ${context.currentFile.path}`);
      if (context.currentFile.selection) {
        parts.push(`- User has selected text in the editor (shown in the user message)`);
      }
    }

    if (context.recentFiles.length > 0) {
      parts.push(`- Recent files: ${context.recentFiles.join(', ')}`);
    }

    if (context.openFiles.length > 0) {
      parts.push(`- Open files: ${context.openFiles.join(', ')}`);
    }

    parts.push(`## Guidelines
- Always read a file before editing it to understand its current content.
- Use fileManager.renameFile() for renaming (auto-updates links). The rename_file tool handles this.
- Use processFrontMatter() for atomic frontmatter edits. The set_frontmatter tool handles this.
- For destructive operations (delete), the system will ask the user for confirmation.
- When searching, return file paths and brief context, not full content.
- For large files, use offset/limit parameters to paginate.
- Report what you did after completing operations — be concise but clear.
- You can call multiple tools in parallel when they are independent.
- If a tool returns an error, try a different approach or inform the user.`);

    if (customPrompt) {
      parts.push(`\n## User Instructions\n${customPrompt}`);
    }

    return parts.join('\n');
  }

  getContextSummary(context: VaultContext): string {
    const parts: string[] = [];
    if (context.currentFile) {
      parts.push(`File: ${context.currentFile.path}`);
      if (context.currentFile.selection) {
        parts.push(` (${context.currentFile.selection.length} chars selected)`);
      }
    }
    parts.push(`${context.openFiles.length} tabs open`);
    return parts.join(' | ');
  }
}
