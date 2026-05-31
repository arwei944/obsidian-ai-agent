import type { App, TFile } from 'obsidian';
import { TFile as TFileClass, MarkdownView } from 'obsidian';
import type { ToolDefinition, ToolResult } from '../types/tool-types';

export function createNoteTools(app: App): ToolDefinition[] {
  const create_note: ToolDefinition = {
    name: 'create_note',
    description: 'Create a new note in the vault with optional initial content and folder.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title / filename (without .md extension)' },
        content: { type: 'string', description: 'Initial content for the note. Default: empty' },
        folder: { type: 'string', description: 'Folder path. Default: vault root' },
        open: { type: 'boolean', description: 'Open the note after creation. Default: false' },
      },
      required: ['title'],
    },
    riskLevel: 'low',
    category: 'note',
    execute: async (input): Promise<ToolResult> => {
      const title = input.title as string;
      const content = (input.content as string) || '';
      const folder = (input.folder as string) || '';
      const shouldOpen = input.open as boolean;

      const path = folder ? `${folder}/${title}.md` : `${title}.md`;

      // Check if exists
      const existing = app.vault.getAbstractFileByPath(path);
      if (existing) {
        return { content: `Error: File already exists: ${path}`, isError: true };
      }

      // Create parent folder
      if (folder) {
        const parent = app.vault.getAbstractFileByPath(folder);
        if (!parent) {
          await app.vault.createFolder(folder);
        }
      }

      const file = await app.vault.create(path, content);

      if (shouldOpen) {
        const leaf = app.workspace.getLeaf('tab');
        await leaf.openFile(file);
      }

      return { content: `Note created: ${path}${content ? ` (${content.length} chars)` : ''}` };
    },
  };

  const append_to_daily: ToolDefinition = {
    name: 'append_to_daily',
    description: 'Append content to today\'s daily note. Creates the daily note if it does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Content to append' },
        heading: { type: 'string', description: 'Optional: append under a specific heading' },
      },
      required: ['content'],
    },
    riskLevel: 'low',
    category: 'note',
    execute: async (input): Promise<ToolResult> => {
      const content = input.content as string;
      const heading = input.heading as string | undefined;

      // Use the daily-notes command to get/create today's note
      // First, try to find today's daily note
      const today = window.moment().format('YYYY-MM-DD');
      const dailyNotesFolder = 'Daily'; // Common default

      // Search for today's daily note
      let dailyFile: TFile | null = null;
      const files = app.vault.getMarkdownFiles();
      for (const file of files) {
        if (file.basename === today || file.basename === window.moment().format('YYYYMMDD')) {
          dailyFile = file;
          break;
        }
      }

      // Also check common patterns
      if (!dailyFile) {
        const patterns = [
          `${dailyNotesFolder}/${today}.md`,
          `Daily/${today}.md`,
          `${today}.md`,
        ];
        for (const p of patterns) {
          const f = app.vault.getAbstractFileByPath(p);
          if (f instanceof TFileClass) {
            dailyFile = f;
            break;
          }
        }
      }

      if (!dailyFile) {
        // Create daily note
        const path = `${dailyNotesFolder}/${today}.md`;
        const folder = app.vault.getAbstractFileByPath(dailyNotesFolder);
        if (!folder) {
          await app.vault.createFolder(dailyNotesFolder);
        }
        dailyFile = await app.vault.create(path, `# ${today}\n\n`);
      }

      if (heading) {
        // Append under heading using process
        await app.vault.process(dailyFile, (data) => {
          const headingRegex = new RegExp(`(^|\n)(#{1,6} ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\n|$))`, 'i');
          const match = data.match(headingRegex);
          if (match) {
            const insertIdx = (match.index || 0) + match[0].length;
            return data.slice(0, insertIdx) + '\n' + content + '\n' + data.slice(insertIdx);
          }
          // Heading not found, append at end under new heading
          return data + `\n## ${heading}\n${content}\n`;
        });
        return { content: `Appended to daily note under "${heading}": ${dailyFile.path}` };
      }

      await app.vault.append(dailyFile, '\n' + content + '\n');
      return { content: `Appended to daily note: ${dailyFile.path}` };
    },
  };

  const get_tasks: ToolDefinition = {
    name: 'get_tasks',
    description: 'Find and list tasks (checkboxes) across the vault. Can filter by status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'incomplete', 'completed'], description: 'Filter by task status. Default: all' },
        path: { type: 'string', description: 'Optional: limit search to a specific directory' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
      },
      required: [],
    },
    riskLevel: 'low',
    category: 'note',
    execute: async (input): Promise<ToolResult> => {
      const status = (input.status as string) || 'all';
      const dirPath = input.path as string | undefined;
      const limit = (input.limit as number) || 50;

      let files = app.vault.getMarkdownFiles();
      if (dirPath) {
        files = files.filter(f => f.path.startsWith(dirPath));
      }

      const tasks: { file: string; line: number; text: string; completed: boolean }[] = [];

      for (const file of files) {
        if (tasks.length >= limit) break;
        const content = await app.vault.cachedRead(file);
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (tasks.length >= limit) break;
          const line = lines[i];
          const match = line.match(/^(\s*)- \[([ xX])\] (.+)/);
          if (match) {
            const completed = match[2] !== ' ';
            if (status === 'incomplete' && completed) continue;
            if (status === 'completed' && !completed) continue;

            tasks.push({
              file: file.path,
              line: i,
              text: match[3],
              completed,
            });
          }
        }
      }

      if (tasks.length === 0) {
        return { content: `No ${status === 'all' ? '' : status + ' '}tasks found.` };
      }

      const lines = tasks.map(t =>
        `${t.completed ? '✅' : '⬜'} ${t.file}:${t.line} — ${t.text}`
      );

      return {
        content: `${tasks.length} tasks (${status}):\n${lines.join('\n')}`,
      };
    },
  };

  return [create_note, append_to_daily, get_tasks];
}
