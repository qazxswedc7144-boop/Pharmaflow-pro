import React from 'react';

export type SettingsGroupId = 'system' | 'i18n' | 'business' | 'maintenance';

export interface SettingsSectionItem {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  icon: React.ElementType;
  groupId: SettingsGroupId;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

export interface SettingsGroup {
  id: SettingsGroupId;
  title: string;
  description: string;
  icon: React.ElementType;
  colorClass: string;
}

