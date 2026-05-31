import type { App, TFile, Editor, MarkdownView } from 'obsidian';

export type RiskLevel = 'low' | 'medium' | 'high';
export type ToolCategory = 'file' | 'metadata' | 'search' | 'editor' | 'workspace' | 'note' | 'command' | 'system';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchemaObject;
  riskLevel: RiskLevel;
  category: ToolCategory;
  execute: (input: Record<string, unknown>, context: ExecutionContext) => Promise<ToolResult>;
}

export interface JSONSchemaObject {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface JSONSchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface ExecutionContext {
  app: App;
  getActiveFile: () => TFile | null;
  getActiveEditor: () => Editor | null;
  getActiveView: () => MarkdownView | null;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
  truncated?: boolean;
  totalLength?: number;
}
