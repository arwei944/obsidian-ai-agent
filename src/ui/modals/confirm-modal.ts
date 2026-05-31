import { App, Modal } from 'obsidian';

export class ConfirmModal extends Modal {
  private toolName: string;
  private input: Record<string, unknown>;
  private resolvePromise!: (value: boolean) => void;

  constructor(app: App, toolName: string, input: Record<string, unknown>) {
    super(app);
    this.toolName = toolName;
    this.input = input;
  }

  open(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      super.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('ai-confirm-modal');

    contentEl.createEl('h3', { text: '确认执行操作' });
    contentEl.createEl('p', {
      text: `AI 要执行的操作: ${this.toolName}`,
      cls: 'ai-confirm-tool-name',
    });

    const inputEl = contentEl.createEl('pre', { cls: 'ai-confirm-input' });
    inputEl.textContent = JSON.stringify(this.input, null, 2);

    const buttonRow = contentEl.createDiv({ cls: 'ai-confirm-buttons' });

    const cancelBtn = buttonRow.createEl('button', { text: '取消', cls: 'ai-confirm-cancel' });
    cancelBtn.addEventListener('click', () => {
      this.resolvePromise(false);
      this.close();
    });

    const confirmBtn = buttonRow.createEl('button', { text: '执行', cls: 'ai-confirm-execute' });
    confirmBtn.addEventListener('click', () => {
      this.resolvePromise(true);
      this.close();
    });

    cancelBtn.focus();
  }

  onClose(): void {
    this.containerEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(false);
    }
  }
}
