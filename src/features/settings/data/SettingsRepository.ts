import { configurationService } from '@/services/config/configurationService';
import type { SettingValue } from './SettingsService';

export class SettingsRepository {
  async get(key: string): Promise<SettingValue> {
    return await configurationService.get(key);
  }

  async set(key: string, value: SettingValue): Promise<void> {
    await configurationService.set(key, value);
  }

  async getAll(): Promise<Record<string, SettingValue>> {
    return await configurationService.getAll();
  }
}

export const settingsRepository = new SettingsRepository();

