import type { PluginSettings } from '../types/settings-types';
import { DEFAULT_SETTINGS } from '../types/settings-types';

interface DataStore {
  loadData(): Promise<Record<string, unknown>>;
  saveData(data: Record<string, unknown>): Promise<void>;
}

export class SettingsStore {
  constructor(private store: DataStore) {}

  async load(): Promise<PluginSettings> {
    const data = await this.store.loadData();
    if (!data?.settings) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...data.settings };
  }

  async save(settings: PluginSettings): Promise<void> {
    const data = (await this.store.loadData()) || {};
    data.settings = settings;
    await this.store.saveData(data);
  }
}
