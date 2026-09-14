import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { backupOrchestrator } from '@/features/backup/services/BackupOrchestrator';

/**
 * React Hook for Automated Backup Lifecycle and Online Sync Orchestration.
 * Coordinates automatic backups during page lifecycle changes without blocking UI.
 */
export const useAutoBackup = () => {
  const { autoBackupEnabled, backupPassword } = useSettingsStore();
  const isTriggeringRef = useRef(false);

  useEffect(() => {
    // 1. Online Sync Listener
    const handleOnline = () => {
      backupOrchestrator.syncPendingCloudBackups().catch(() => {
        // Handled internally in orchestrator
      });
    };

    window.addEventListener('online', handleOnline);

    // 2. Lifecycle Trigger for Auto Backup
    const handleLifecycleTrigger = (source: 'pagehide' | 'visibilitychange' | 'beforeunload') => {
      if (!autoBackupEnabled || !backupPassword || !backupPassword.trim()) {
        return;
      }

      if (isTriggeringRef.current || backupOrchestrator.isBackupInProgress()) {
        return;
      }

      isTriggeringRef.current = true;
      backupOrchestrator.triggerAutoBackup({
        source: source === 'visibilitychange' || source === 'pagehide' || source === 'beforeunload' ? 'exit' : 'lifecycle',
        password: backupPassword
      }).catch(() => {
        // Handled internally in orchestrator
      }).finally(() => {
        isTriggeringRef.current = false;
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleLifecycleTrigger('visibilitychange');
      }
    };

    const handlePageHide = () => {
      handleLifecycleTrigger('pagehide');
    };

    const handleBeforeUnload = () => {
      handleLifecycleTrigger('beforeunload');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [autoBackupEnabled, backupPassword]);
};
