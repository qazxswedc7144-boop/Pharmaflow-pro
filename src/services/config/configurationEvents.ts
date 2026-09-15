// src/services/config/configurationEvents.ts
import { ConfigChangeEvent } from '@/core/config/types';

type ConfigEventListener = (event: ConfigChangeEvent) => void;

class ConfigurationEventEmitter {
  private keyListeners: Map<string, Set<ConfigEventListener>> = new Map();
  private globalListeners: Set<ConfigEventListener> = new Set();

  public subscribe(
    keyOrListener: string | ConfigEventListener,
    callback?: ConfigEventListener
  ): () => void {
    if (typeof keyOrListener === 'function') {
      this.globalListeners.add(keyOrListener);
      return () => {
        this.globalListeners.delete(keyOrListener);
      };
    } else if (typeof keyOrListener === 'string' && callback) {
      if (!this.keyListeners.has(keyOrListener)) {
        this.keyListeners.set(keyOrListener, new Set());
      }
      this.keyListeners.get(keyOrListener)!.add(callback);

      return () => {
        const set = this.keyListeners.get(keyOrListener);
        if (set) {
          set.delete(callback);
          if (set.size === 0) {
            this.keyListeners.delete(keyOrListener);
          }
        }
      };
    }
    return () => {};
  }

  public emit(event: ConfigChangeEvent): void {
    // Notify global listeners
    this.globalListeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('[ConfigurationEvents] Error in global listener:', err);
      }
    });

    // Notify key-specific listeners
    const specific = this.keyListeners.get(event.key);
    if (specific) {
      specific.forEach(listener => {
        try {
          listener(event);
        } catch (err) {
          console.error(`[ConfigurationEvents] Error in listener for ${event.key}:`, err);
        }
      });
    }

    // Dispatch custom DOM event for external system components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('PHARMAFLOW_CONFIG_CHANGED', { detail: event }));
    }
  }
}

export const configurationEvents = new ConfigurationEventEmitter();
