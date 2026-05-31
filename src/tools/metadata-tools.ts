import type { App, TFile } from 'obsidian';
import { TFile as TFileClass, TFolder as TFolderClass } from 'obsidian';
import type { ToolDefinition, ToolResult } from '../types/tool-types';

export function createMetadataTools(app: App): ToolDefinition[] {
  const get_frontmatter: ToolDefinition = {
    name: 'get_frontmatter',
    description: 'Read the YAML frontmatter of a file. Returns the parsed frontmatter as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
    riskLevel: 'low',
    category: 'metadata',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      const cache = app.metadataCache.getFileCache(file);
      if (!cache?.frontmatter) {
        return { content: `No frontmatter found in ${path}` };
      }

      return { content: JSON.stringify(cache.frontmatter, null, 2) };
    },
  };

  const set_frontmatter: ToolDefinition = {
    name: 'set_frontmatter',
    description: 'Set or update a frontmatter property. Atomic operation that does not affect the file body. Creates frontmatter if it does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        key: { type: 'string', description: 'The frontmatter property key' },
        value: { type: 'string', description: 'The value to set (will be parsed as YAML — strings, numbers, arrays, objects all supported)' },
      },
      required: ['path', 'key', 'value'],
    },
    riskLevel: 'medium',
    category: 'metadata',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const key = input.key as string;
      const rawValue = input.value as string;

      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      // Parse value
      let value: unknown;
      try {
        value = JSON.parse(rawValue);
      } catch {
        value = rawValue;
      }

      await app.fileManager.processFrontMatter(file, (fm) => {
        fm[key] = value;
      });

      return { content: `Set frontmatter: ${key} = ${JSON.stringify(value)} in ${path}` };
    },
  };

  const get_tags: ToolDefinition = {
    name: 'get_tags',
    description: 'Get all tags used in a file, or list all tags across the entire vault.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path. If omitted, returns all tags in the vault.' },
      },
      required: [],
    },
    riskLevel: 'low',
    category: 'metadata',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string | undefined;

      if (path) {
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFileClass)) {
          return { content: `Error: File not found: ${path}`, isError: true };
        }
        const cache = app.metadataCache.getFileCache(file);
        const tags = cache?.tags?.map(t => t.tag) || [];
        const fmTags = cache?.frontmatter?.tags || [];
        const all = [...new Set([...tags, ...(Array.isArray(fmTags) ? fmTags : [fmTags])])];
        return { content: all.length > 0 ? all.join('\n') : 'No tags found in this file.' };
      }

      // All vault tags
      const tagSet = new Set<string>();
      const files = app.vault.getMarkdownFiles();
      for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);
        if (cache?.tags) {
          cache.tags.forEach(t => tagSet.add(t.tag));
        }
        const fmTags = cache?.frontmatter?.tags;
        if (Array.isArray(fmTags)) {
          fmTags.forEach(t => tagSet.add(t.startsWith('#') ? t : `#${t}`));
        }
      }

      const sorted = [...tagSet].sort();
      return {
        content: sorted.length > 0
          ? `${sorted.length} tags found:\n${sorted.join('\n')}`
          : 'No tags found in vault.',
      };
    },
  };

  const get_links: ToolDefinition = {
    name: 'get_links',
    description: 'Get all outgoing links (wikilinks) from a file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
    riskLevel: 'low',
    category: 'metadata',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      const cache = app.metadataCache.getFileCache(file);
      const links = cache?.links?.map(l => ({
        link: l.link,
        display: l.displayText || l.link,
        resolved: !!app.metadataCache.getFirstLinkpathDest(l.link, path),
      })) || [];

      if (links.length === 0) {
        return { content: `No outgoing links in ${path}` };
      }

      const lines = links.map(l =>
        l.resolved ? `[[${l.link}]]` : `[[${l.link}]] (unresolved)`
      );
      return { content: `${links.length} links:\n${lines.join('\n')}` };
    },
  };

  const get_backlinks: ToolDefinition = {
    name: 'get_backlinks',
    description: 'Get all files that link to the specified file (backlinks).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
    riskLevel: 'low',
    category: 'metadata',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      const backlinks = app.metadataCache.getBacklinksForFile(file);
      const entries: string[] = [];

      for (const [filePath, links] of backlinks.data) {
        entries.push(`${filePath} (${links.length} link${links.length > 1 ? 's' : ''})`);
      }

      if (entries.length === 0) {
        return { content: `No backlinks found for ${path}` };
      }

      return { content: `${entries.length} backlinks:\n${entries.join('\n')}` };
    },
  };

  const get_headings: ToolDefinition = {
    name: 'get_headings',
    description: 'Get the heading structure (outline) of a file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
    riskLevel: 'low',
    category: 'metadata',
    execute: async (input): Promise<ToolResult> => {
      const path = input.path as string;
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFileClass)) {
        return { content: `Error: File not found: ${path}`, isError: true };
      }

      const cache = app.metadataCache.getFileCache(file);
      const headings = cache?.headings || [];

      if (headings.length === 0) {
        return { content: `No headings found in ${path}` };
      }

      const lines = headings.map(h => `${'  '.repeat(h.level - 1)}${'#'.repeat(h.level)} ${h.heading}`);
      return { content: `${headings.length} headings:\n${lines.join('\n')}` };
    },
  };

  const get_vault_graph: ToolDefinition = {
    name: 'get_vault_graph',
    description: 'Get the link graph of the vault. Returns a summary of resolved and unresolved links.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional: get links for a specific file only' },
        limit: { type: 'number', description: 'Max number of entries to return. Default: 50' },
      },
      required: [],
    },
    riskLevel: 'low',
    category: 'metadata',
    execute: async (input): Promise<ToolResult> => {
      const limit = (input.limit as number) || 50;
      const path = input.path as string | undefined;

      const resolved = app.metadataCache.resolvedLinks;
      const unresolved = app.metadataCache.unresolvedLinks;

      if (path) {
        const links = resolved[path] || {};
        const unlinks = unresolved[path] || {};
        const resolvedEntries = Object.entries(links).map(([target, count]) => `  → ${target} (${count})`);
        const unresolvedEntries = Object.entries(unlinks).map(([target, count]) => `  → ${target} (${count}) [unresolved]`);

        return {
          content: [
            `Links from ${path}:`,
            ...resolvedEntries,
            ...unresolvedEntries,
          ].join('\n') || `No links from ${path}`,
        };
      }

      // Global summary
      const totalResolved = Object.values(resolved).reduce((sum, links) => sum + Object.keys(links).length, 0);
      const totalUnresolved = Object.values(unresolved).reduce((sum, links) => sum + Object.keys(links).length, 0);
      const filesWithLinks = Object.keys(resolved).length;
      const filesWithUnresolved = Object.keys(unresolved).length;

      // Find most linked-to files
      const linkCounts: Record<string, number> = {};
      for (const source of Object.values(resolved)) {
        for (const [target, count] of Object.entries(source)) {
          linkCounts[target] = (linkCounts[target] || 0) + count;
        }
      }
      const topLinked = Object.entries(linkCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);

      return {
        content: [
          `Vault Link Graph Summary:`,
          `  Total resolved links: ${totalResolved}`,
          `  Total unresolved links: ${totalUnresolved}`,
          `  Files with outgoing links: ${filesWithLinks}`,
          `  Files with unresolved links: ${filesWithUnresolved}`,
          ``,
          `Most linked-to files:`,
          ...topLinked.map(([f, c]) => `  ${f} (${c} links)`),
        ].join('\n'),
      };
    },
  };

  return [get_frontmatter, set_frontmatter, get_tags, get_links, get_backlinks, get_headings, get_vault_graph];
}
