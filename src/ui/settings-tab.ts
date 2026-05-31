import { App, PluginSettingTab, Setting } from 'obsidian';
import type ObsidianAIAgentPlugin from '../main';
import type { PluginSettings, ConfirmationPolicy } from '../types/settings-types';

export class AIAgentSettingTab extends PluginSettingTab {
  plugin: ObsidianAIAgentPlugin;

  constructor(app: App, plugin: ObsidianAIAgentPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ai-agent-settings');

    containerEl.createEl('h2', { text: 'AI 智能体设置' });

    // ── API 服务商 ──
    new Setting(containerEl)
      .setName('API 服务商')
      .setDesc('选择 Claude 或 OpenAI 兼容格式（可接入任何兼容 OpenAI 接口的服务）')
      .addDropdown(dropdown => {
        dropdown
          .addOption('claude', 'Claude (Anthropic)')
          .addOption('openai', 'OpenAI 兼容');
        dropdown.setValue(this.plugin.settings.apiProvider);
        dropdown.onChange(async (value) => {
          this.plugin.settings.apiProvider = value as 'claude' | 'openai';
          await this.plugin.saveSettings();
          this.display(); // 刷新页面以显示不同的模型列表
        });
      });

    // ── API Key ──
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('你的 API 密钥，安全存储在 Obsidian 本地。')
      .addText(text => {
        text
          .setPlaceholder(this.plugin.settings.apiProvider === 'claude' ? 'sk-ant-...' : 'sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
        text.inputEl.style.width = '100%';
      });

    // ── API 端点（OpenAI 模式下显示） ──
    if (this.plugin.settings.apiProvider === 'openai') {
      new Setting(containerEl)
        .setName('API 端点')
        .setDesc('自定义 API 地址，留空使用官方地址。支持任何 OpenAI 兼容接口（如 DeepSeek、Ollama、vLLM 等）')
        .addText(text => {
          text
            .setPlaceholder('https://api.openai.com')
            .setValue(this.plugin.settings.apiEndpoint)
            .onChange(async (value) => {
              this.plugin.settings.apiEndpoint = value;
              await this.plugin.saveSettings();
            });
          text.inputEl.style.width = '100%';
        });
    }

    // ── 模型 ──
    new Setting(containerEl)
      .setName('模型')
      .setDesc('选择使用的模型。')
      .addDropdown(dropdown => {
        if (this.plugin.settings.apiProvider === 'claude') {
          dropdown.addOption('claude-opus-4-7', 'Claude Opus 4.7 (最强)');
          dropdown.addOption('claude-sonnet-4-6', 'Claude Sonnet 4.6 (均衡)');
          dropdown.addOption('claude-haiku-4-5', 'Claude Haiku 4.5 (最快)');
        } else {
          dropdown.addOption('gpt-4o', 'GPT-4o');
          dropdown.addOption('gpt-4o-mini', 'GPT-4o Mini');
          dropdown.addOption('gpt-4-turbo', 'GPT-4 Turbo');
          dropdown.addOption('deepseek-chat', 'DeepSeek Chat');
          dropdown.addOption('deepseek-reasoner', 'DeepSeek Reasoner');
          dropdown.addOption('qwen-max', '通义千问 Max');
          dropdown.addOption('glm-4', 'GLM-4');
          dropdown.addOption('custom', '自定义模型...');
        }
        if (!dropdown.selectEl.querySelector(`option[value="${this.plugin.settings.model}"]`)) {
          dropdown.addOption(this.plugin.settings.model, this.plugin.settings.model);
        }
        dropdown.setValue(this.plugin.settings.model);
        dropdown.onChange(async (value) => {
          if (value === 'custom') {
            this.plugin.settings.model = prompt('请输入模型名称：') || this.plugin.settings.model;
          } else {
            this.plugin.settings.model = value;
          }
          await this.plugin.saveSettings();
        });
      });

    // ── 自定义模型名（OpenAI 模式） ──
    if (this.plugin.settings.apiProvider === 'openai') {
      new Setting(containerEl)
        .setName('自定义模型名称')
        .setDesc('如果下拉列表中没有你想要的模型，在这里直接输入。')
        .addText(text => {
          text
            .setPlaceholder('例如：claude-3-5-sonnet-20241022')
            .setValue(this.plugin.settings.model)
            .onChange(async (value) => {
              this.plugin.settings.model = value;
              await this.plugin.saveSettings();
            });
          text.inputEl.style.width = '100%';
        });
    }

    // ── 最大 Token ──
    new Setting(containerEl)
      .setName('最大 Token 数')
      .setDesc('回复的最大 Token 数量，越大可生成越长的回复。')
      .addSlider(slider => {
        slider
          .setLimits(1024, 32768, 1024)
          .setValue(this.plugin.settings.maxTokens)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxTokens = value;
            await this.plugin.saveSettings();
          });
      });

    // ── 温度 ──
    new Setting(containerEl)
      .setName('温度 (Temperature)')
      .setDesc('控制随机性：0 = 确定性输出，1 = 创造性输出。')
      .addSlider(slider => {
        slider
          .setLimits(0, 1, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          });
      });

    // ── 扩展思维（仅 Claude） ──
    if (this.plugin.settings.apiProvider === 'claude') {
      new Setting(containerEl)
        .setName('扩展思维 (Extended Thinking)')
        .setDesc('开启 Claude 的深度思考模式，适合复杂推理任务。')
        .addDropdown(dropdown => {
          dropdown
            .addOption('adaptive', '自适应（自动判断）')
            .addOption('off', '关闭');
          dropdown.setValue(this.plugin.settings.thinkingMode);
          dropdown.onChange(async (value) => {
            this.plugin.settings.thinkingMode = value as 'adaptive' | 'off';
            await this.plugin.saveSettings();
          });
        });
    }

    // ── 确认策略 ──
    new Setting(containerEl)
      .setName('确认策略')
      .setDesc('执行危险操作前是否需要确认。')
      .addDropdown(dropdown => {
        const policies: Record<ConfirmationPolicy, string> = {
          'always': '始终确认',
          'high_risk_only': '仅高风险（删除、重命名）',
          'medium_and_high': '中高风险',
          'never': '从不确认',
        };
        for (const [value, label] of Object.entries(policies)) {
          dropdown.addOption(value, label);
        }
        dropdown.setValue(this.plugin.settings.confirmationPolicy);
        dropdown.onChange(async (value) => {
          this.plugin.settings.confirmationPolicy = value as ConfirmationPolicy;
          await this.plugin.saveSettings();
        });
      });

    // ── 最大工具迭代 ──
    new Setting(containerEl)
      .setName('最大工具迭代次数')
      .setDesc('每条消息最多执行多少轮工具调用，防止无限循环。')
      .addSlider(slider => {
        slider
          .setLimits(1, 50, 1)
          .setValue(this.plugin.settings.maxToolIterations)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxToolIterations = value;
            await this.plugin.saveSettings();
          });
      });

    // ── 显示思维过程 ──
    new Setting(containerEl)
      .setName('显示思维过程')
      .setDesc('在聊天中显示 AI 的思考过程。')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.showThinking);
        toggle.onChange(async (value) => {
          this.plugin.settings.showThinking = value;
          await this.plugin.saveSettings();
        });
      });

    // ── 语言 ──
    new Setting(containerEl)
      .setName('回复语言')
      .setDesc('AI 回复使用的语言。')
      .addDropdown(dropdown => {
        dropdown
          .addOption('auto', '自动匹配')
          .addOption('zh', '中文')
          .addOption('en', '英文');
        dropdown.setValue(this.plugin.settings.language);
        dropdown.onChange(async (value) => {
          this.plugin.settings.language = value as 'auto' | 'zh' | 'en';
          await this.plugin.saveSettings();
        });
      });

    // ── 当前文件作为上下文 ──
    new Setting(containerEl)
      .setName('当前文件作为上下文')
      .setDesc('自动将当前打开的文件内容发送给 AI。')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.activeFileAsContext);
        toggle.onChange(async (value) => {
          this.plugin.settings.activeFileAsContext = value;
          await this.plugin.saveSettings();
        });
      });

    // ── 选中文本作为上下文 ──
    new Setting(containerEl)
      .setName('选中文本作为上下文')
      .setDesc('有选中文本时，只发送选中部分而非整个文件。')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.selectionAsContext);
        toggle.onChange(async (value) => {
          this.plugin.settings.selectionAsContext = value;
          await this.plugin.saveSettings();
        });
      });

    // ── 自定义系统提示词 ──
    new Setting(containerEl)
      .setName('自定义系统提示词')
      .setDesc('附加到系统提示中的自定义指令。')
      .addTextArea(text => {
        text
          .setPlaceholder('例如：始终使用中文回复。使用正式语气。')
          .setValue(this.plugin.settings.customSystemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.customSystemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = '100%';
        text.inputEl.rows = 4;
      });
  }
}
