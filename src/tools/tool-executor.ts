import type { App, TFile } from 'obsidian';
import type { ToolUseBlock, ToolResultBlock } from '../types/api-types';
import type { ToolDefinition, ExecutionContext, ToolResult } from '../types/tool-types';
import type { PluginSettings, ConfirmationPolicy } from '../types/settings-types';
import type { ToolRegistry } from './tool-registry';
import { SnapshotStore } from '../storage/snapshot-store';

export interface ToolExecutionCallbacks {
  onToolStart: (name: string, input: Record<string, unknown>) => void;
  onToolEnd: (name: string, result: ToolResult, duration: number) => void;
  onConfirmationNeeded: (tool: ToolDefinition, input: Record<string, unknown>) => Promise<boolean>;
}

export class ToolExecutor {
  private snapshotStore: SnapshotStore;

  constructor(
    private registry: ToolRegistry,
    private app: App,
    private settings: PluginSettings
  ) {
    this.snapshotStore = new SnapshotStore(app);
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  async executeAll(
    blocks: ToolUseBlock[],
    callbacks: ToolExecutionCallbacks
  ): Promise<ToolResultBlock[]> {
    // Execute all tools in parallel
    const results = await Promise.all(
      blocks.map(block => this.executeOne(block, callbacks))
    );
    return results;
  }

  private async executeOne(
    block: ToolUseBlock,
    callbacks: ToolExecutionCallbacks
  ): Promise<ToolResultBlock> {
    const tool = this.registry.getTool(block.name);

    if (!tool) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: `Error: Unknown tool "${block.name}". Available tools: ${this.registry.getTools().map(t => t.name).join(', ')}`,
        is_error: true,
      };
    }

    // Check confirmation
    if (this.needsConfirmation(tool)) {
      const confirmed = await callbacks.onConfirmationNeeded(tool, block.input);
      if (!confirmed) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'Operation cancelled by user.',
          is_error: true,
        };
      }
    }

    callbacks.onToolStart(block.name, block.input);
    const startTime = Date.now();

    // Save snapshot for write operations
    if (tool.riskLevel !== 'low') {
      const filePath = block.input.path as string;
      if (filePath) {
        await this.snapshotStore.saveSnapshot(block.name, filePath);
      }
    }

    try {
      const context = this.buildExecutionContext();
      const result = await tool.execute(block.input, context);
      const duration = Date.now() - startTime;

      callbacks.onToolEnd(block.name, result, duration);

      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorResult: ToolResult = {
        content: `Tool execution error: ${(error as Error).message}`,
        isError: true,
      };
      callbacks.onToolEnd(block.name, errorResult, duration);

      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: errorResult.content,
        is_error: true,
      };
    }
  }

  private needsConfirmation(tool: ToolDefinition): boolean {
    const policy = this.settings.confirmationPolicy;
    switch (policy) {
      case 'always': return true;
      case 'high_risk_only': return tool.riskLevel === 'high';
      case 'medium_and_high': return tool.riskLevel !== 'low';
      case 'never': return false;
      default: return tool.riskLevel === 'high';
    }
  }

  private buildExecutionContext(): ExecutionContext {
    const workspace = this.app.workspace;
    return {
      app: this.app,
      getActiveFile: () => workspace.getActiveFile(),
      getActiveEditor: () => {
        const view = workspace.getActiveViewOfType(
          // Dynamic import avoidance — we check for editor property
          workspace.getActiveViewOfType?.call(workspace, { prototype: { editor: true } } as any) as any
        );
        return (view as any)?.editor ?? null;
      },
      getActiveView: () => {
        const leaves = workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
          if (leaf.view && 'editor' in leaf.view) {
            return leaf.view as any;
          }
        }
        return null;
      },
    };
  }

  getSnapshotStore(): SnapshotStore {
    return this.snapshotStore;
  }
}
