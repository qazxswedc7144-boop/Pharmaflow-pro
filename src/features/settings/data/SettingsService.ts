import { configurationService } from '@/services/config/configurationService';

export type SettingValue = string | boolean | number | null;

export class SettingsService {
  async getAllSettings(): Promise<Record<string, SettingValue>> {
    return await configurationService.getAll();
  }

  async getSettingsGroup(groupKeys: string[]): Promise<Record<string, SettingValue>> {
    return await configurationService.getGroup(groupKeys);
  }

  async saveSetting(key: string, value: SettingValue, _sync: boolean = false) {
    await configurationService.set(key, value);
  }

  async saveMultipleSettings(settings: Record<string, SettingValue>, _sync: boolean = false) {
    await configurationService.saveMultiple(settings);
  }
}

export const settingsService = new SettingsService();

