import type { App } from 'obsidian';
import type { ToolDefinition, ToolResult } from '../types/tool-types';

export function createCommandTools(app: App): ToolDefinition[] {
  const execute_command: ToolDefinition = {
    name: 'execute_command',
    description: 'Execute any registered Obsidian command by its ID. Use list_commands to discover available commands.',
    inputSchema: {
      type: 'object',
      properties: {
        command_id: { type: 'string', description: 'The command ID, e.g., "editor:toggle-bold", "app:go-back"' },
      },
      required: ['command_id'],
    },
    riskLevel: 'medium',
    category: 'command',
    execute: async (input): Promise<ToolResult> => {
      const commandId = input.command_id as string;
      // @ts-ignore - internal API
      const commands = (app as any).commands;
      if (!commands) {
        return { content: 'Error: Command system not available.', isError: true };
      }

      const command = commands.commands?.[commandId];
      if (!command) {
        return {
          content: `Error: Command not found: ${commandId}. Use list_commands to see available commands.`,
          isError: true,
        };
      }

      try {
        commands.executeCommandById(commandId);
        return { content: `Executed: ${command.name} (${commandId})` };
      } catch (error) {
        return {
          content: `Error executing ${commandId}: ${(error as Error).message}`,
          isError: true,
        };
      }
    },
  };

  const list_commands: ToolDefinition = {
    name: 'list_commands',
    description: 'List all available Obsidian commands. Optionally filter by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filter commands by keyword (case-insensitive)' },
        namespace: {
          type: 'string',
          description: 'Filter by command namespace prefix',
          enum: ['editor', 'app', 'workspace', 'file-explorer', 'daily-notes',
            'templates', 'graph', 'outline', 'backlink', 'global-search',
            'tag-pane', 'note-composer', 'slides', 'bookmarks', 'theme'],
        },
      },
      required: [],
    },
    riskLevel: 'low',
    category: 'command',
    execute: async (input): Promise<ToolResult> => {
      // @ts-ignore - internal API
      const commands = (app as any).commands;
      if (!commands) {
        return { content: 'Error: Command system not available.', isError: true };
      }

      let entries = Object.entries(commands.commands || {}) as [string, { name: string }][];

      if (input.namespace) {
        entries = entries.filter(([id]) => id.startsWith((input.namespace as string) + ':'));
      }

      if (input.filter) {
        const filter = (input.filter as string).toLowerCase();
        entries = entries.filter(([id, cmd]) =>
          id.toLowerCase().includes(filter) ||
          cmd.name.toLowerCase().includes(filter)
        );
      }

      const limit = 50;
      const top = entries.slice(0, limit);
      const lines = top.map(([id, cmd]) => `${id} => ${cmd.name}`);

      let result = lines.join('\n');
      if (entries.length > limit) {
        result += `\n\n[Showing ${limit} of ${entries.length}. Use filter/namespace to narrow down.]`;
      }

      return { content: result || 'No commands found matching the filter.' };
    },
  };

  return [execute_command, list_commands];
}
