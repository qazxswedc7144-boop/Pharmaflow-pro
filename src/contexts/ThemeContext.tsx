import React, { createContext, useContext, useEffect, useState } from 'react';
import { configurationService } from '@/services/config/configurationService';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeState] = useState<ThemeMode>(() => {
    const syncVal = configurationService.getSync<ThemeMode>('user.theme');
    return syncVal || 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  const updateRootThemeAndResolved = (mode: ThemeMode) => {
    let isDark = false;
    if (mode === 'dark') {
      isDark = true;
    } else if (mode === 'system') {
      isDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    setResolvedTheme(isDark ? 'dark' : 'light');

    if (typeof document !== 'undefined') {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  useEffect(() => {
    // Load setting asynchronously from configurationService
    configurationService.get<ThemeMode>('user.theme').then((mode) => {
      if (mode) {
        setThemeState(mode);
        updateRootThemeAndResolved(mode);
      }
    });

    // Subscribe to theme configuration changes
    const unsubscribe = configurationService.subscribe('user.theme', (event) => {
      if (event.value) {
        const newMode = event.value as ThemeMode;
        setThemeState(newMode);
        updateRootThemeAndResolved(newMode);
      }
    });

    const systemMedia = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const handleSystemMediaChange = () => {
      if (themeMode === 'system') {
        updateRootThemeAndResolved('system');
      }
    };

    if (systemMedia) {
      systemMedia.addEventListener('change', handleSystemMediaChange);
    }

    return () => {
      unsubscribe();
      if (systemMedia) {
        systemMedia.removeEventListener('change', handleSystemMediaChange);
      }
    };
  }, [themeMode]);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeState(mode);
    updateRootThemeAndResolved(mode);
    await configurationService.set('user.theme', mode);
  };

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

