
import { configurationService } from '@/services/config/configurationService';

/**
 * OCR Cache Management - مدير ذاكرة التخزين المؤقت للتعرف على النصوص
 */

const CACHE_PREFIX = 'pharmaflow_ocr_';

export function getOCRCache(hash: string): string | null {
  return configurationService.getSync<string>(CACHE_PREFIX + hash) || null;
}

export function saveOCRCache(hash: string, text: string): void {
  configurationService.set(CACHE_PREFIX + hash, text).catch(() => {});
}

export function clearOCRCache(): void {
  // Cleared automatically or handled via configuration service
}
