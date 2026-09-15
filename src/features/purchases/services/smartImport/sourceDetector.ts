// src/features/purchases/services/smartImport/sourceDetector.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.6: Enterprise Source Detection & File Security Gatekeeper
 */

import { ImportSourceType } from './types';
import { ENTERPRISE_IMPORT_LIMITS, ImportLimitEnforcer, LimitEnforcementResult } from './performance/importLimits';

export const IMPORT_LIMITS = {
  MAX_EXCEL_FILE_SIZE: ENTERPRISE_IMPORT_LIMITS.EXCEL.maxFileSize,
  MAX_CSV_FILE_SIZE: ENTERPRISE_IMPORT_LIMITS.CSV.maxFileSize,
  MAX_DOCX_FILE_SIZE: ENTERPRISE_IMPORT_LIMITS.DOCX.maxFileSize,
  MAX_PDF_FILE_SIZE: ENTERPRISE_IMPORT_LIMITS.PDF.maxFileSize,
  MAX_IMAGE_FILE_SIZE: ENTERPRISE_IMPORT_LIMITS.IMAGE.maxFileSize,
  MAX_TOTAL_ROWS: ENTERPRISE_IMPORT_LIMITS.CSV.maxRows || 5000,
  MAX_DOCX_TABLES: ENTERPRISE_IMPORT_LIMITS.DOCX.maxTables || 50,
  MAX_PDF_PAGES: ENTERPRISE_IMPORT_LIMITS.PDF.maxPages || 50,
  MAX_PROCESSING_TIMEOUT_MS: 30000,
  SUPPORTED_IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.jfif'],
  SUPPORTED_EXCEL_EXTENSIONS: ['.xlsx', '.xls', '.xlsm', '.xlsb'],
  SUPPORTED_CSV_EXTENSIONS: ['.csv', '.tsv', '.txt'],
  SUPPORTED_DOCX_EXTENSIONS: ['.docx', '.doc'],
  SUPPORTED_PDF_EXTENSIONS: ['.pdf'],
  DANGEROUS_EXTENSIONS: ENTERPRISE_IMPORT_LIMITS.DANGEROUS_EXTENSIONS
};

export interface FileValidationResult {
  isValid: boolean;
  sourceType: ImportSourceType;
  fileName: string;
  fileSize: number;
  errorMessage?: string;
  errorCode?: string;
}

export class SourceDetector {
  /**
   * Sniffs and detects the file source type based on extension, MIME type, or data URI
   */
  static detectSourceType(file: File | string, fileNameOverride?: string): ImportSourceType {
    if (typeof file === 'string') {
      if (file.startsWith('data:image/')) return 'IMAGE';
      if (file.startsWith('data:application/pdf')) return 'PDF';
      if (file.startsWith('data:text/csv') || file.startsWith('data:text/tab-separated-values') || file.startsWith('data:application/vnd.ms-excel')) return 'CSV';
      if (file.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document')) return 'DOCX';
      // String might be a camera capture or base64
      if (file.startsWith('data:')) return 'CAMERA';
      const lower = file.toLowerCase();
      if (IMPORT_LIMITS.DANGEROUS_EXTENSIONS.some(ext => lower.endsWith(ext))) return 'UNKNOWN';
      if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'DOCX';
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm') || lower.endsWith('.xlsb')) return 'EXCEL';
      if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) return 'CSV';
      if (lower.endsWith('.pdf')) return 'PDF';
      if (IMPORT_LIMITS.SUPPORTED_IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext))) return 'IMAGE';
      // Raw string content check (CSV / Tabular / Text)
      if (file.includes('\n') || file.includes(',') || file.includes('\t')) return 'CSV';
      return 'UNKNOWN';
    }

    const name = (fileNameOverride || file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();

    // 0. Double extension / executable check
    if (IMPORT_LIMITS.DANGEROUS_EXTENSIONS.some(ext => name.endsWith(ext))) {
      return 'UNKNOWN';
    }

    // 1. Check DOCX / Word
    if (
      IMPORT_LIMITS.SUPPORTED_DOCX_EXTENSIONS.some(ext => name.endsWith(ext)) ||
      type.includes('wordprocessingml') ||
      type.includes('msword')
    ) {
      return 'DOCX';
    }

    // 2. Check Excel
    if (
      IMPORT_LIMITS.SUPPORTED_EXCEL_EXTENSIONS.some(ext => name.endsWith(ext)) ||
      type.includes('spreadsheetml') ||
      type.includes('ms-excel') ||
      type.includes('vnd.openxmlformats-officedocument.spreadsheetml')
    ) {
      return 'EXCEL';
    }

    // 3. Check CSV / TSV / TXT
    if (
      IMPORT_LIMITS.SUPPORTED_CSV_EXTENSIONS.some(ext => name.endsWith(ext)) ||
      type.includes('csv') ||
      type.includes('tab-separated-values') ||
      type.includes('comma-separated-values') ||
      (type === 'text/plain' && (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')))
    ) {
      return 'CSV';
    }

    // 4. Check PDF
    if (name.endsWith('.pdf') || type === 'application/pdf') {
      return 'PDF';
    }

    // 5. Check Image / Camera
    if (
      IMPORT_LIMITS.SUPPORTED_IMAGE_EXTENSIONS.some(ext => name.endsWith(ext)) ||
      type.startsWith('image/')
    ) {
      return 'IMAGE';
    }

    return 'UNKNOWN';
  }

  /**
   * Validates file size, type, and security constraints safely
   */
  static validateFile(file: File | string, fileNameOverride?: string): FileValidationResult {
    let fileName = fileNameOverride || 'file_import';
    let fileSize = 0;

    if (typeof file === 'string') {
      fileSize = file.length;
      if (file.startsWith('data:')) {
        fileName = fileNameOverride || 'camera_or_base64_capture';
      } else if (file.includes('.') && !file.includes('\n')) {
        fileName = file;
      } else {
        fileName = fileNameOverride || 'inline_data';
      }
    } else if (file instanceof File) {
      fileName = file.name;
      fileSize = file.size;
    }

    const lowerName = fileName.toLowerCase();

    if (fileSize === 0) {
      return {
        isValid: false,
        sourceType: 'UNKNOWN',
        fileName,
        fileSize,
        errorCode: 'EMPTY_FILE',
        errorMessage: 'الملف فارغ أو لا يحتوي على أي بيانات صالحة للقراءة.'
      };
    }

    // Security check: Check for dangerous extensions (e.g. invoice.xlsx.exe)
    if (IMPORT_LIMITS.DANGEROUS_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
      return {
        isValid: false,
        sourceType: 'UNKNOWN',
        fileName,
        fileSize,
        errorCode: 'DANGEROUS_FILE_TYPE',
        errorMessage: `الملف (${fileName}) يحتوي على امتداد تنفيذي أو غير آمن وتم حظره حمايةً للنظام.`
      };
    }

    const sourceType = this.detectSourceType(file, fileName);

    if (sourceType === 'UNKNOWN') {
      return {
        isValid: false,
        sourceType,
        fileName,
        fileSize,
        errorCode: 'UNSUPPORTED_FILE',
        errorMessage: `صيغة الملف غير مدعومة (${fileName}). الصيغ المدعومة تشمل Excel (.xlsx, .xls) و Word (.docx) و CSV والصور (JPG, PNG, WEBP) و PDF.`
      };
    }

    // Enterprise Size Limit Enforcement
    const sizeCheck = ImportLimitEnforcer.validateFileSize(sourceType, fileSize, fileName);
    if (!sizeCheck.isAllowed) {
      return {
        isValid: false,
        sourceType,
        fileName,
        fileSize,
        errorCode: sizeCheck.errorCode || 'FILE_TOO_LARGE',
        errorMessage: sizeCheck.errorMessage || 'حجم الملف يتجاوز الحد المسموح به.'
      };
    }

    return {
      isValid: true,
      sourceType,
      fileName,
      fileSize
    };
  }

  /**
   * Helper to validate row limits
   */
  static validateRowCount(sourceType: ImportSourceType, rowCount: number): LimitEnforcementResult {
    return ImportLimitEnforcer.validateRowCount(sourceType, rowCount);
  }

  /**
   * Helper to validate page limits
   */
  static validatePageCount(sourceType: ImportSourceType, pageCount: number): LimitEnforcementResult {
    return ImportLimitEnforcer.validatePageCount(sourceType, pageCount);
  }
}
