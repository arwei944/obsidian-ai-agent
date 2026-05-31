import type { App } from 'obsidian';
import { Platform } from 'obsidian';
import type { ToolDefinition, ToolResult } from '../types/tool-types';

export function createSystemTools(app: App): ToolDefinition[] {
  const get_vault_info: ToolDefinition = {
    name: 'get_vault_info',
    description: 'Get information about the current vault: name, file count, folder count, and platform.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    riskLevel: 'low',
    category: 'system',
    execute: async (): Promise<ToolResult> => {
      const files = app.vault.getFiles();
      const folders = app.vault.getAllFolders();
      const mdFiles = app.vault.getMarkdownFiles();
      const totalSize = files.reduce((sum, f) => sum + f.stat.size, 0);

      return {
        content: JSON.stringify({
          name: app.vault.getName(),
          totalFiles: files.length,
          markdownFiles: mdFiles.length,
          folders: folders.length,
          totalSize: formatSize(totalSize),
          platform: Platform.isDesktop ? 'desktop' : 'mobile',
          os: Platform.isMacOS ? 'macOS' : Platform.isWin ? 'Windows' : Platform.isLinux ? 'Linux' : 'unknown',
          apiVersion: (window as any).app?.vault?.adapter?.getName?.() || 'unknown',
        }, null, 2),
      };
    },
  };

  const get_current_datetime: ToolDefinition = {
    name: 'get_current_datetime',
    description: 'Get the current date and time in various formats.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', description: 'Optional: moment.js format string. Default: ISO format' },
      },
      required: [],
    },
    riskLevel: 'low',
    category: 'system',
    execute: async (input): Promise<ToolResult> => {
      const now = window.moment();
      const format = input.format as string | undefined;

      if (format) {
        return { content: now.format(format) };
      }

      return {
        content: JSON.stringify({
          iso: now.toISOString(),
          date: now.format('YYYY-MM-DD'),
          time: now.format('HH:mm:ss'),
          dayOfWeek: now.format('dddd'),
          unix: now.unix(),
        }, null, 2),
      };
    },
  };

  const show_notice: ToolDefinition = {
    name: 'show_notice',
    description: 'Show a notification message in Obsidian.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Notification message' },
        duration: { type: 'number', description: 'Duration in milliseconds. Default: 5000. Use 0 for persistent.' },
      },
      required: ['message'],
    },
    riskLevel: 'low',
    category: 'system',
    execute: async (input): Promise<ToolResult> => {
      const { Notice } = require('obsidian');
      const duration = (input.duration as number) ?? 5000;
      new Notice(input.message as string, duration);
      return { content: `Notice shown: ${input.message}` };
    },
  };

  return [get_vault_info, get_current_datetime, show_notice];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
