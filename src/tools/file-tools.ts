import type { App, TFile, TFolder } from 'obsidian';
import { TFile as TFileClass, TFolder as TFolderClass } from 'obsidian';
import type { ToolDefinition, ExecutionContext, ToolResult } from '../types/tool-types';

export function createFileTools(app: App): ToolDefinition[] {
  const read_file: ToolDefinition = {
    name: 'read_file',
    description: 'Read the contents of a file in the vault. Returns the full text content. For large files, use offset/limit to paginate.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file relative to vault root, e.g., "notes/reading.md"' },
        offset: { type: 'number', description: 'Line number to start reading from (0-indexed). Default: 0' },
        limit: { type: 'number', description: 'Maximum number of lines to read. Default: all lines' },
      },
      required: ['path'],
    },
    riskLevel: 'low',
    category: 'file',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      let content = await app.vault.read(file);
      const lines = content.split('\n');

      const offset = (input.offset as number) || 0;
      const limit = (input.limit as number) || lines.length;
      const selected = lines.slice(offset, offset + limit);

      const result = selected.join('\n');
      const totalLines = lines.length;

      if (offset > 0 || limit < totalLines) {
        return {
          content: `[Lines ${offset}-${offset + selected.length - 1} of ${totalLines}]\n\n${result}`,
          truncated: offset + limit < totalLines,
        };
      }

      if (content.length > 50000) {
        return {
          content: content.slice(0, 50000) + `\n\n[TRUNCATED: File is ${content.length} chars. Use offset/limit to read more.]`,
          truncated: true,
          totalLength: content.length,
        };
      }

      return { content: result };
    },
  };

  const write_file: ToolDefinition = {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing file. Creates parent folders if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file relative to vault root' },
        content: { type: 'string', description: 'The content to write to the file' },
      },
      required: ['path', 'content'],
    },
    riskLevel: 'medium',
    category: 'file',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const content = input.content as string;
      const existing = app.vault.getAbstractFileByPath(path);

      if (existing instanceof TFileClass) {
        await app.vault.modify(existing, content);
        return { content: `File updated: ${path} (${content.length} chars)` };
      }

      // Create parent folders
      const parts = path.split('/');
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('/');
        const parent = app.vault.getAbstractFileByPath(parentPath);
        if (!parent) {
          await app.vault.createFolder(parentPath);
        }
      }

      await app.vault.create(path, content);
      return { content: `File created: ${path} (${content.length} chars)` };
    },
  };

  const append_file: ToolDefinition = {
    name: 'append_file',
    description: 'Append content to the end of a file. Creates the file if it does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        content: { type: 'string', description: 'Content to append' },
      },
      required: ['path', 'content'],
    },
    riskLevel: 'low',
    category: 'file',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const content = input.content as string;
      const existing = app.vault.getAbstractFileByPath(path);

      if (existing instanceof TFileClass) {
        await app.vault.append(existing, content);
        return { content: `Appended to ${path} (${content.length} chars)` };
      }

      // Create file
      const parts = path.split('/');
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('/');
        const parent = app.vault.getAbstractFileByPath(parentPath);
        if (!parent) {
          await app.vault.createFolder(parentPath);
        }
      }
      await app.vault.create(path, content);
      return { content: `File created: ${path} (${content.length} chars)` };
    },
  };

  const edit_file: ToolDefinition = {
    name: 'edit_file',
    description: 'Edit a file by finding and replacing text. Supports exact match and regex. Use all=true to replace all occurrences.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        find: { type: 'string', description: 'Text to find (exact match by default)' },
        replace: { type: 'string', description: 'Text to replace with' },
        regex: { type: 'boolean', description: 'Treat find as regex pattern. Default: false' },
        all: { type: 'boolean', description: 'Replace all occurrences. Default: false' },
      },
      required: ['path', 'find', 'replace'],
    },
    riskLevel: 'medium',
    category: 'file',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      const original = await app.vault.read(file);
      let result: string;
      let count: number;

      if (input.regex) {
        const flags = input.all ? 'g' : '';
        try {
          const regex = new RegExp(input.find as string, flags);
          const matches = original.match(regex);
          count = matches ? matches.length : 0;
          result = original.replace(regex, input.replace as string);
        } catch (e) {
          return { content: `Error: Invalid regex: ${(e as Error).message}`, isError: true };
        }
      } else {
        if (input.all) {
          count = original.split(input.find as string).length - 1;
          result = original.replaceAll(input.find as string, input.replace as string);
        } else {
          count = original.includes(input.find as string) ? 1 : 0;
          result = original.replace(input.find as string, input.replace as string);
        }
      }

      if (count === 0) {
        return { content: `No matches found for "${input.find}" in ${path}` };
      }

      await app.vault.modify(file, result);
      return { content: `Replaced ${count} occurrence(s) in ${path}` };
    },
  };

  const delete_file: ToolDefinition = {
    name: 'delete_file',
    description: 'Delete a file (moves to system trash). Requires user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to delete' },
      },
      required: ['path'],
    },
    riskLevel: 'high',
    category: 'file',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      await app.vault.trash(file, true);
      return { content: `File moved to trash: ${path}` };
    },
  };

  const rename_file: ToolDefinition = {
    name: 'rename_file',
    description: 'Rename or move a file. Automatically updates all links pointing to this file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Current path of the file' },
        newPath: { type: 'string', description: 'New path for the file' },
      },
      required: ['path', 'newPath'],
    },
    riskLevel: 'medium',
    category: 'file',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const newPath = input.newPath as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      await app.fileManager.renameFile(file, newPath);
      return { content: `Renamed: ${path} → ${newPath}` };
    },
  };

  const copy_file: ToolDefinition = {
    name: 'copy_file',
    description: 'Copy a file to a new location.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Source file path' },
        newPath: { type: 'string', description: 'Destination path' },
      },
      required: ['path', 'newPath'],
    },
    riskLevel: 'low',
    category: 'file',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const newPath = input.newPath as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      await app.vault.copy(file, newPath);
      return { content: `Copied: ${path} → ${newPath}` };
    },
  };

  const list_files: ToolDefinition = {
    name: 'list_files',
    description: 'List files and folders in a directory. Returns a tree-like listing.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path. Use "" for vault root.' },
        depth: { type: 'number', description: 'Max depth to recurse. Default: 1 (immediate children only)' },
        filter: { type: 'string', description: 'Filter results by extension, e.g., "md" for markdown files only' },
      },
      required: [],
    },
    riskLevel: 'low',
    category: 'file',
    execute: async (input): Promise<ToolResult> => {
      const dirPath = (input.path as string) || '';
      const depth = (input.depth as number) || 1;
      const filter = input.filter as string | undefined;

      const folder = dirPath
        ? app.vault.getAbstractFileByPath(dirPath)
        : app.vault.getRoot();

      if (!(folder instanceof TFolderClass)) {
        return { content: `Error: Directory not found: ${dirPath}`, isError: true };
      }

      const lines: string[] = [];
      const maxItems = 100;

      function listFolder(f: TFolder, currentDepth: number, prefix: string): void {
        if (lines.length >= maxItems) return;

        const sorted = [...f.children].sort((a, b) => {
          const aIsDir = a instanceof TFolderClass;
          const bIsDir = b instanceof TFolderClass;
          if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        for (const child of sorted) {
          if (lines.length >= maxItems) break;

          if (child instanceof TFolderClass) {
            lines.push(`${prefix}📁 ${child.name}/`);
            if (currentDepth < depth) {
              listFolder(child, currentDepth + 1, prefix + '  ');
            }
          } else {
            if (filter && !child.name.endsWith(`.${filter}`)) continue;
            const size = (child as TFile).stat?.size || 0;
            lines.push(`${prefix}📄 ${child.name} (${formatSize(size)})`);
          }
        }
      }

      listFolder(folder, 0, '');

      if (lines.length === 0) {
        return { content: `Directory is empty: ${dirPath || '/'}` };
      }

      let result = lines.join('\n');
      if (lines.length >= maxItems) {
        result += `\n\n[Showing first ${maxItems} items]`;
      }
      return { content: result };
    },
  };

  const get_file_info: ToolDefinition = {
    name: 'get_file_info',
    description: 'Get metadata about a file: size, creation time, modification time, and frontmatter summary.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
    riskLevel: 'low',
    category: 'file',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      const cache = app.metadataCache.getFileCache(file);
      const info: Record<string, unknown> = {
        path: file.path,
        name: file.name,
        extension: file.extension,
        size: formatSize(file.stat.size),
        created: new Date(file.stat.ctime).toISOString(),
        modified: new Date(file.stat.mtime).toISOString(),
      };

      if (cache?.frontmatter) {
        info.frontmatter = cache.frontmatter;
      }
      if (cache?.headings) {
        info.headings = cache.headings.map(h => `${'#'.repeat(h.level)} ${h.heading}`);
      }
      if (cache?.tags) {
        info.tags = cache.tags.map(t => t.tag);
      }

      return { content: JSON.stringify(info, null, 2) };
    },
  };

  return [read_file, write_file, append_file, edit_file, delete_file, rename_file, copy_file, list_files, get_file_info];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
