// src/features/purchases/services/smartImport/performance/importLimits.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: Smart Import Performance & Large File Limits Hardening
 */

import { ImportSourceType } from '../types';

export interface SourceLimitConfig {
  maxFileSize: number; // in bytes
  maxRows?: number;
  maxPages?: number;
  maxTables?: number;
  maxCells?: number;
  maxDimensions?: { width: number; height: number };
  maxPixels?: number;
}

export const ENTERPRISE_IMPORT_LIMITS: Record<ImportSourceType, SourceLimitConfig> & {
  GLOBAL_MEMORY_BUDGET_BYTES: number;
  DEFAULT_CHUNK_SIZE: number;
  YIELD_INTERVAL_MS: number;
  FUZZY_CACHE_CAPACITY: number;
  DANGEROUS_EXTENSIONS: string[];
} = {
  CSV: {
    maxFileSize: 25 * 1024 * 1024, // 25 MB
    maxRows: 5000,
    maxCells: 100000
  },
  TSV: {
    maxFileSize: 25 * 1024 * 1024,
    maxRows: 5000,
    maxCells: 100000
  },
  TXT: {
    maxFileSize: 20 * 1024 * 1024,
    maxRows: 5000,
    maxCells: 100000
  },
  EXCEL: {
    maxFileSize: 25 * 1024 * 1024, // 25 MB
    maxRows: 5000,
    maxCells: 100000,
    maxTables: 20
  },
  DOCX: {
    maxFileSize: 20 * 1024 * 1024, // 20 MB
    maxPages: 50,
    maxTables: 50,
    maxRows: 3000
  },
  PDF: {
    maxFileSize: 30 * 1024 * 1024, // 30 MB
    maxPages: 50,
    maxRows: 5000
  },
  PDF_TEXT: {
    maxFileSize: 30 * 1024 * 1024,
    maxPages: 50,
    maxRows: 5000
  },
  PDF_SCANNED: {
    maxFileSize: 30 * 1024 * 1024,
    maxPages: 25,
    maxRows: 3000
  },
  IMAGE: {
    maxFileSize: 15 * 1024 * 1024, // 15 MB
    maxDimensions: { width: 4096, height: 4096 },
    maxPixels: 16 * 1024 * 1024, // 16 MegaPixels
    maxRows: 1000
  },
  CAMERA: {
    maxFileSize: 15 * 1024 * 1024,
    maxDimensions: { width: 4096, height: 4096 },
    maxPixels: 16 * 1024 * 1024,
    maxRows: 1000
  },
  UNKNOWN: {
    maxFileSize: 10 * 1024 * 1024,
    maxRows: 1000
  },
  GLOBAL_MEMORY_BUDGET_BYTES: 100 * 1024 * 1024, // 100 MB budget
  DEFAULT_CHUNK_SIZE: 150, // 150 items per processing slice
  YIELD_INTERVAL_MS: 16, // Yield back to main thread (60 FPS tick)
  FUZZY_CACHE_CAPACITY: 500,
  DANGEROUS_EXTENSIONS: ['.exe', '.bat', '.cmd', '.sh', '.vbs', '.js', '.msi', '.jar', '.scr', '.ps1', '.dll', '.com']
};

export interface LimitEnforcementResult {
  isAllowed: boolean;
  errorCode?: 'FILE_TOO_LARGE' | 'EXCEEDS_MAX_ROWS' | 'EXCEEDS_MAX_PAGES' | 'EXCEEDS_MAX_CELLS' | 'IMAGE_TOO_LARGE' | 'MEMORY_BUDGET_EXCEEDED' | 'DANGEROUS_FILE_TYPE';
  errorMessage?: string;
  suggestedAction?: string;
}

export class ImportLimitEnforcer {
  /**
   * Validates raw file size and source constraints
   */
  static validateFileSize(sourceType: ImportSourceType, fileSize: number, _fileName: string = ''): LimitEnforcementResult {
    const limits = ENTERPRISE_IMPORT_LIMITS[sourceType] || ENTERPRISE_IMPORT_LIMITS.UNKNOWN;
    
    if (fileSize > limits.maxFileSize) {
      const maxMb = (limits.maxFileSize / (1024 * 1024)).toFixed(0);
      const actualMb = (fileSize / (1024 * 1024)).toFixed(1);
      return {
        isAllowed: false,
        errorCode: 'FILE_TOO_LARGE',
        errorMessage: `حجم الملف (${actualMb} ميجابايت) يتجاوز الحد المسموح به لنوع ${sourceType} وهو ${maxMb} ميجابايت.`,
        suggestedAction: 'يرجى تقسيم الملف أو تقليل حجم المستند والمحاولة مجدداً.'
      };
    }

    return { isAllowed: true };
  }

  /**
   * Validates parsed row counts against source constraints
   */
  static validateRowCount(sourceType: ImportSourceType, rowCount: number): LimitEnforcementResult {
    const limits = ENTERPRISE_IMPORT_LIMITS[sourceType] || ENTERPRISE_IMPORT_LIMITS.UNKNOWN;
    const maxRows = limits.maxRows || 5000;

    if (rowCount > maxRows) {
      return {
        isAllowed: false,
        errorCode: 'EXCEEDS_MAX_ROWS',
        errorMessage: `عدد الأسطر المقروءة (${rowCount} سطر) يتجاوز الحد الأقصى المسموح به في جلسة واحدة (${maxRows} سطر).`,
        suggestedAction: 'يرجى استيراد البيانات على دفعات لا تتجاوز 5000 سطر للدفعة الواحدة.'
      };
    }

    return { isAllowed: true };
  }

  /**
   * Validates document page count (for PDF / DOCX)
   */
  static validatePageCount(sourceType: ImportSourceType, pageCount: number): LimitEnforcementResult {
    const limits = ENTERPRISE_IMPORT_LIMITS[sourceType] || ENTERPRISE_IMPORT_LIMITS.UNKNOWN;
    const maxPages = limits.maxPages || 50;

    if (pageCount > maxPages) {
      return {
        isAllowed: false,
        errorCode: 'EXCEEDS_MAX_PAGES',
        errorMessage: `عدد صفحات المستند (${pageCount} صفحة) يتجاوز الحد الأقصى المسموح به للمعالجة الفورية (${maxPages} صفحة).`,
        suggestedAction: 'يرجى استخراج صفحات الفاتورة المطلوبة فقط.'
      };
    }

    return { isAllowed: true };
  }

  /**
   * Validates image dimensions and pixel count
   */
  static validateImageBounds(width: number, height: number): LimitEnforcementResult {
    const limits = ENTERPRISE_IMPORT_LIMITS.IMAGE;
    const maxDim = limits.maxDimensions || { width: 4096, height: 4096 };
    const maxPixels = limits.maxPixels || 16 * 1024 * 1024;
    const totalPixels = width * height;

    if (width > maxDim.width || height > maxDim.height || totalPixels > maxPixels) {
      return {
        isAllowed: false,
        errorCode: 'IMAGE_TOO_LARGE',
        errorMessage: `أبعاد الصورة (${width}x${height} بكسل) تتجاوز الحد الأقصى للأمان (${maxDim.width}x${maxDim.height} بكسل).`,
        suggestedAction: 'سيتم تحجيم الصورة تلقائياً للحفاظ على الأداء واستخراج النصوص بوضوح.'
      };
    }

    return { isAllowed: true };
  }

  /**
   * Validates grid cell budget
   */
  static validateCellCount(sourceType: ImportSourceType, rows: number, cols: number): LimitEnforcementResult {
    const limits = ENTERPRISE_IMPORT_LIMITS[sourceType] || ENTERPRISE_IMPORT_LIMITS.UNKNOWN;
    const maxCells = limits.maxCells || 100000;
    const totalCells = rows * cols;

    if (totalCells > maxCells) {
      return {
        isAllowed: false,
        errorCode: 'EXCEEDS_MAX_CELLS',
        errorMessage: `حجم شبكة البيانات (${totalCells.toLocaleString()} خلية) يتجاوز ميزانية الذاكرة الآمنة (${maxCells.toLocaleString()} خلية).`,
        suggestedAction: 'يرجى تصفية الأعمدة والبيانات غير المطلوبة قبل الاستيراد.'
      };
    }

    return { isAllowed: true };
  }
}
