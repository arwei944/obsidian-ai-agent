import type { App, TFile } from 'obsidian';
import { TFile as TFileClass, prepareFuzzySearch, prepareSimpleSearch, sortSearchResults } from 'obsidian';
import type { ToolDefinition, ToolResult } from '../types/tool-types';

export function createSearchTools(app: App): ToolDefinition[] {
  const search_vault: ToolDefinition = {
    name: 'search_vault',
    description: 'Search for text across all files in the vault. Returns matching file paths with context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        path: { type: 'string', description: 'Optional: limit search to a specific directory' },
        limit: { type: 'number', description: 'Max results to return. Default: 20' },
      },
      required: ['query'],
    },
    riskLevel: 'low',
    category: 'search',
    execute: async (input): Promise<ToolResult> => {
      const query = (input.query as string).toLowerCase();
      const dirPath = input.path as string | undefined;
      const limit = (input.limit as number) || 20;

      let files = app.vault.getMarkdownFiles();
      if (dirPath) {
        files = files.filter(f => f.path.startsWith(dirPath));
      }

      const results: { path: string; snippet: string; score: number }[] = [];

      for (const file of files) {
        if (results.length >= limit * 3) break; // Pre-limit reads

        try {
          const content = await app.vault.cachedRead(file);
          const lower = content.toLowerCase();
          const idx = lower.indexOf(query);

          if (idx !== -1) {
            // Extract snippet around match
            const start = Math.max(0, idx - 60);
            const end = Math.min(content.length, idx + query.length + 60);
            let snippet = content.slice(start, end).replace(/\n/g, ' ');
            if (start > 0) snippet = '...' + snippet;
            if (end < content.length) snippet += '...';

            // Simple relevance score: title match > body match
            const titleMatch = file.basename.toLowerCase().includes(query) ? 10 : 0;
            const count = lower.split(query).length - 1;
            results.push({
              path: file.path,
              snippet,
              score: titleMatch + count,
            });
          }
        } catch {
          // Skip unreadable files
        }
      }

      results.sort((a, b) => b.score - a.score);
      const top = results.slice(0, limit);

      if (top.length === 0) {
        return { content: `No results found for "${input.query}"` };
      }

      const lines = top.map(r => {
        return `📄 ${r.path}\n   ${r.snippet}`;
      });

      return {
        content: `${results.length} results for "${input.query}"${results.length > limit ? ` (showing ${limit})` : ''}:\n\n${lines.join('\n\n')}`,
      };
    },
  };

  const search_by_tag: ToolDefinition = {
    name: 'search_by_tag',
    description: 'Find all files that have a specific tag.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Tag to search for (with or without #)' },
      },
      required: ['tag'],
    },
    riskLevel: 'low',
    category: 'search',
    execute: async (input): Promise<ToolResult> => {
      let tag = input.tag as string;
      if (!tag.startsWith('#')) tag = '#' + tag;

      const files = app.vault.getMarkdownFiles();
      const matches: string[] = [];

      for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);
        const fileTags = cache?.tags?.map(t => t.tag) || [];
        const fmTags = cache?.frontmatter?.tags;
        const allTags = [...fileTags];
        if (Array.isArray(fmTags)) {
          allTags.push(...fmTags.map((t: string) => t.startsWith('#') ? t : `#${t}`));
        }

        if (allTags.includes(tag)) {
          matches.push(file.path);
        }
      }

      if (matches.length === 0) {
        return { content: `No files found with tag ${tag}` };
      }

      return { content: `${matches.length} files with tag ${tag}:\n${matches.join('\n')}` };
    },
  };

  const search_by_property: ToolDefinition = {
    name: 'search_by_property',
    description: 'Find files that have a specific frontmatter property value.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Frontmatter property key' },
        value: { type: 'string', description: 'Optional: property value to match. If omitted, finds all files with the key.' },
      },
      required: ['key'],
    },
    riskLevel: 'low',
    category: 'search',
    execute: async (input): Promise<ToolResult> => {
      const key = input.key as string;
      const value = input.value as string | undefined;

      const files = app.vault.getMarkdownFiles();
      const matches: string[] = [];

      for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        if (!fm || !(key in fm)) continue;

        if (value === undefined) {
          matches.push(`${file.path}: ${key} = ${JSON.stringify(fm[key])}`);
        } else {
          const fmValue = JSON.stringify(fm[key]).toLowerCase();
          if (fmValue.includes(value.toLowerCase())) {
            matches.push(`${file.path}: ${key} = ${JSON.stringify(fm[key])}`);
          }
        }
      }

      if (matches.length === 0) {
        return { content: `No files found with ${key}${value ? ` = ${value}` : ''}` };
      }

      return { content: `${matches.length} files:\n${matches.join('\n')}` };
    },
  };

  const get_recent_files: ToolDefinition = {
    name: 'get_recent_files',
    description: 'Get the most recently opened files.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of files to return. Default: 10' },
      },
      required: [],
    },
    riskLevel: 'low',
    category: 'search',
    execute: async (input): Promise<ToolResult> => {
      const limit = (input.limit as number) || 10;
      const recent = app.workspace.getLastOpenFiles().slice(0, limit);

      if (recent.length === 0) {
        return { content: 'No recently opened files.' };
      }

      return { content: `${recent.length} recent files:\n${recent.join('\n')}` };
    },
  };

  return [search_vault, search_by_tag, search_by_property, get_recent_files];
}
