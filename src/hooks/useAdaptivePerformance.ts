import { useState, useEffect, useCallback } from 'react';
import { settingsService } from '@/features/settings/data/SettingsService';

export interface PerformanceSpecs {
  hardwareConcurrency: number; // CPU Cores
  deviceMemory: number; // RAM in GB
  saveData: boolean; // Data saver mode
  isMobileSize: boolean;
  isLowSpec: boolean;
}

export type EcoModeValue = 'auto' | 'enabled' | 'disabled';

export function useAdaptivePerformance() {
  const [specs, setSpecs] = useState<PerformanceSpecs>({
    hardwareConcurrency: 4,
    deviceMemory: 4,
    saveData: false,
    isMobileSize: window.innerWidth < 1024,
    isLowSpec: false,
  });

  const [ecoMode, setEcoMode] = useState<EcoModeValue>('auto');
  const [simplifiedAnimations, setSimplifiedAnimations] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize and load specs
  useEffect(() => {
    const detectSpecs = async () => {
      // 1. Hardware Concurrency (CPU Cores)
      const cores = navigator.hardwareConcurrency || 4;

      // 2. Device Memory (RAM in GB)
      // Note: navigator.deviceMemory is available in Chrome/Chromium but undefined in Firefox/Safari
      const navWithMem = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
      const ram = navWithMem.deviceMemory || 4;

      // 3. Save Data (Data saver mode)
      const connection = navWithMem.connection;
      const saveData = connection ? !!connection.saveData : false;

      // 4. Mobile size check
      const isMobileSize = window.innerWidth < 1024;

      // 5. Check if it's a low-spec device based on metrics
      // CPU <= 4 cores or RAM <= 4 GB is typically considered a low-to-mid end mobile or entry PC
      const isLowSpec = cores <= 4 || ram <= 4 || saveData || isMobileSize;

      // Load persistent settings
      try {
        const settings = await settingsService.getSettingsGroup(['eco_mode', 'simplified_animations']);
        const savedEco = (settings.eco_mode as EcoModeValue) || 'auto';
        const savedSimplifiedAnims = settings.simplified_animations === true || settings.simplified_animations === 'true';

        setEcoMode(savedEco);
        setSimplifiedAnimations(savedSimplifiedAnims);

        setSpecs({
          hardwareConcurrency: cores,
          deviceMemory: ram,
          saveData,
          isMobileSize,
          isLowSpec,
        });
      } catch (err) {
        console.warn('Failed to load performance settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    detectSpecs();

    // Resize listener
    const handleResize = () => {
      setSpecs((prev) => ({
        ...prev,
        isMobileSize: window.innerWidth < 1024,
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const updateSetting = useCallback(async (key: 'eco_mode' | 'simplified_animations', value: EcoModeValue | boolean) => {
    if (key === 'eco_mode') {
      setEcoMode(value as EcoModeValue);
    } else if (key === 'simplified_animations') {
      setSimplifiedAnimations(!!value);
    }
    try {
      await settingsService.saveSetting(key, value, false);
    } catch (err) {
      console.error(`Failed to save settings key ${key}:`, err);
    }
  }, []);

  // Compute live active values
  const isEcoActive = 
    ecoMode === 'enabled' || 
    (ecoMode === 'auto' && specs.isLowSpec);

  const animationsEnabled = !simplifiedAnimations && !isEcoActive;
  
  // Throttle values based on specs
  const maxListLimit = isEcoActive ? 15 : 50;
  const bgSyncInterval = isEcoActive ? 30000 : 5000;
  const lowRamMode = specs.deviceMemory <= 4;

  // Cleanup/Garbage Collection suggestion trigger
  const requestStateCleanup = useCallback(() => {
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        // Safe-catch if browser requires flags for gc
      }
    }
    // Clean up large localStorage caches if any
    const keysToClean = ['pharmaflow_temp_pdf', 'pharmaflow_invoice_draft_temp'];
    keysToClean.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });
  }, []);

  return {
    specs,
    ecoMode,
    simplifiedAnimations,
    isEcoActive,
    animationsEnabled,
    maxListLimit,
    bgSyncInterval,
    lowRamMode,
    isLoading,
    updateSetting,
    requestStateCleanup
  };
}
