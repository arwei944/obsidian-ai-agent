import type { App } from 'obsidian';

interface Snapshot {
  toolName: string;
  filePath: string;
  content: string;
  timestamp: number;
}

const MAX_SNAPSHOTS = 50;

export class SnapshotStore {
  private snapshots: Snapshot[] = [];

  constructor(private app: App) {}

  async saveSnapshot(toolName: string, filePath: string): Promise<void> {
    const files = this.app.vault.getFiles();
    const file = files.find(f => f.path === filePath);
    if (!file) return;

    try {
      const content = await this.app.vault.cachedRead(file);
      this.snapshots.push({
        toolName,
        filePath,
        content,
        timestamp: Date.now(),
      });
      this.trim();
    } catch {
      // File may not exist yet (for write operations)
    }
  }

  getSnapshots(): Snapshot[] {
    return [...this.snapshots];
  }

  getLatestSnapshot(filePath: string): Snapshot | undefined {
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (this.snapshots[i].filePath === filePath) {
        return this.snapshots[i];
      }
    }
    return undefined;
  }

  async restoreSnapshot(filePath: string): Promise<boolean> {
    const snapshot = this.getLatestSnapshot(filePath);
    if (!snapshot) return false;

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file) {
      await this.app.vault.modify(file as TFile, snapshot.content);
      return true;
    }
    return false;
  }

  clear(): void {
    this.snapshots = [];
  }

  private trim(): void {
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots = this.snapshots.slice(-MAX_SNAPSHOTS);
    }
  }
}
