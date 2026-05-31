export type ApiProvider = 'claude' | 'openai';
export type ConfirmationPolicy = 'always' | 'high_risk_only' | 'medium_and_high' | 'never';

export interface PluginSettings {
  apiKey: string;
  apiEndpoint: string;
  apiProvider: ApiProvider;
  model: string;
  maxTokens: number;
  temperature: number;
  thinkingMode: 'adaptive' | 'off';
  effortLevel: 'low' | 'medium' | 'high' | 'max';
  confirmationPolicy: ConfirmationPolicy;
  maxToolIterations: number;
  customSystemPrompt: string;
  showThinking: boolean;
  language: 'auto' | 'zh' | 'en';
  theme: 'auto' | 'light' | 'dark';
  activeFileAsContext: boolean;
  selectionAsContext: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: '',
  apiEndpoint: '',
  apiProvider: 'claude',
  model: 'claude-sonnet-4-6',
  maxTokens: 8192,
  temperature: 0.7,
  thinkingMode: 'adaptive',
  effortLevel: 'high',
  confirmationPolicy: 'high_risk_only',
  maxToolIterations: 20,
  customSystemPrompt: '',
  showThinking: false,
  language: 'auto',
  theme: 'auto',
  activeFileAsContext: true,
  selectionAsContext: true,
};
