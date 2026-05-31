import type { ToolDefinition, ToolSchema } from '../types/tool-types';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getSchemas(): ToolSchema[] {
    return this.getTools().map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  getToolsByCategory(category: string): ToolDefinition[] {
    return this.getTools().filter(t => t.category === category);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  size(): number {
    return this.tools.size;
  }

  clear(): void {
    this.tools.clear();
  }
}
