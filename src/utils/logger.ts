/**
 * 日志系统 - 记录所有插件运行细节，用于调试
 * 日志存储在插件目录下的 agent-logs.json 文件中
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

class Logger {
  private entries: LogEntry[] = [];
  private maxEntries = 2000; // 最多保留 2000 条
  private enabled = true;
  private logFilePath = 'agent-logs.json';

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private add(level: LogLevel, category: string, message: string, data?: unknown): void {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...(data !== undefined ? { data } : {}),
    };

    this.entries.push(entry);

    // 超出限制时裁剪
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.maxEntries - 500);
    }

    // 同时输出到 console
    const prefix = `[AI Agent][${category}]`;
    const logData = data !== undefined ? data : '';
    switch (level) {
      case 'debug': console.debug(prefix, message, logData); break;
      case 'info':  console.info(prefix, message, logData); break;
      case 'warn':  console.warn(prefix, message, logData); break;
      case 'error': console.error(prefix, message, logData); break;
    }
  }

  debug(category: string, message: string, data?: unknown): void {
    this.add('debug', category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.add('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.add('warn', category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.add('error', category, message, data);
  }

  // ── API 日志 ──
  apiRequest(provider: string, endpoint: string, model: string, messageCount: number, toolCount: number): void {
    this.info('API', `请求 ${provider} API`, { endpoint, model, messageCount, toolCount });
  }

  apiResponse(statusCode: number, duration: number): void {
    this.info('API', `响应 ${statusCode}`, { duration: `${duration}ms` });
  }

  apiError(statusCode: number, body: string): void {
    this.error('API', `错误 ${statusCode}`, { body: body.slice(0, 500) });
  }

  apiStreamStart(): void {
    this.debug('API', 'SSE 流开始');
  }

  apiStreamDelta(type: string, length: number): void {
    this.debug('API', `SSE delta: ${type}`, { length });
  }

  apiStreamEnd(): void {
    this.debug('API', 'SSE 流结束');
  }

  // ── 工具日志 ──
  toolExecute(name: string, input: Record<string, unknown>): void {
    this.info('Tool', `执行 ${name}`, { input: this.truncate(input, 500) });
  }

  toolResult(name: string, duration: number, isError: boolean, result: string): void {
    const level = isError ? 'error' as const : 'info' as const;
    this.add(level, 'Tool', `${name} 完成 ${duration}ms`, {
      isError,
      result: this.truncate(result, 500),
    });
  }

  toolNotFound(name: string): void {
    this.error('Tool', `未知工具: ${name}`);
  }

  toolConfirmation(name: string, confirmed: boolean): void {
    this.info('Tool', `${name} 确认: ${confirmed ? '通过' : '拒绝'}`);
  }

  // ── 对话日志 ──
  messageSent(text: string): void {
    this.info('Chat', '发送消息', { text: this.truncate(text, 200) });
  }

  messageReceived(text: string): void {
    this.info('Chat', '收到回复', { text: this.truncate(text, 200) });
  }

  thinkingDelta(length: number): void {
    this.debug('Chat', `思考内容 +${length} 字符`);
  }

  textDelta(length: number): void {
    this.debug('Chat', `文本内容 +${length} 字符`);
  }

  iterationStart(n: number, max: number): void {
    this.info('Chat', `开始第 ${n}/${max} 轮迭代`);
  }

  maxIterationsReached(max: number): void {
    this.warn('Chat', `已达最大迭代次数 ${max}`);
  }

  // ── 上下文日志 ──
  contextBuilt(files: number, totalTokens: number): void {
    this.info('Context', `上下文构建完成`, { files, estimatedTokens: totalTokens });
  }

  // ── 插件日志 ──
  pluginLoaded(): void {
    this.info('Plugin', '插件已加载');
  }

  pluginUnloaded(): void {
    this.info('Plugin', '插件已卸载');
  }

  settingsSaved(settings: Record<string, unknown>): void {
    this.info('Settings', '设置已保存', {
      provider: settings.apiProvider,
      model: settings.model,
      endpoint: settings.apiEndpoint,
    });
  }

  viewOpened(): void {
    this.info('UI', '聊天视图已打开');
  }

  // ── 序列化和导出 ──
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter(e => e.level === level);
  }

  getEntriesByCategory(category: string): LogEntry[] {
    return this.entries.filter(e => e.category === category);
  }

  getSummary(): string {
    const counts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of this.entries) counts[e.level]++;
    return `总计 ${this.entries.length} 条日志: ${counts.debug} debug, ${counts.info} info, ${counts.warn} warn, ${counts.error} error`;
  }

  toJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  clear(): void {
    this.entries = [];
  }

  private truncate(value: unknown, maxLen: number): unknown {
    if (value === undefined || value === null) return value;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (str.length <= maxLen) return value;
    return str.slice(0, maxLen) + `...(${str.length} chars)`;
  }
}

export const logger = new Logger();
